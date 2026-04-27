-- Detect dead listings by polling source_url and marking 404/410 as expired.
-- Async because pg_net writes the response to net._http_response some time
-- after net.http_get returns, so dispatch and harvest run as separate jobs.

CREATE EXTENSION IF NOT EXISTS pg_net;

ALTER TABLE listings ADD COLUMN IF NOT EXISTS last_url_check_at TIMESTAMPTZ;

CREATE TABLE listing_url_checks (
  request_id    BIGINT      PRIMARY KEY,
  listing_id    UUID        NOT NULL REFERENCES listings(listing_id) ON DELETE CASCADE,
  dispatched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX listing_url_checks_listing_id_idx ON listing_url_checks(listing_id);

ALTER TABLE listing_url_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all" ON listing_url_checks FOR ALL USING (false);

CREATE OR REPLACE FUNCTION dispatch_listing_url_checks()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  rec        RECORD;
  req_id     BIGINT;
  dispatched INTEGER := 0;
BEGIN
  FOR rec IN
    SELECT listing_id, source_url
    FROM listings
    WHERE listing_status = 'active'
  LOOP
    req_id := net.http_get(url := rec.source_url, timeout_milliseconds := 10000);

    INSERT INTO listing_url_checks (request_id, listing_id)
    VALUES (req_id, rec.listing_id);

    UPDATE listings
    SET last_url_check_at = now()
    WHERE listing_id = rec.listing_id;

    dispatched := dispatched + 1;
  END LOOP;

  RETURN dispatched;
END;
$$;

CREATE OR REPLACE FUNCTION process_listing_url_check_results()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE listings
  SET listing_status = 'expired',
      updated_at     = now()
  FROM listing_url_checks c
  JOIN net._http_response r ON r.id = c.request_id
  WHERE listings.listing_id = c.listing_id
    AND listings.listing_status = 'active'
    AND r.status_code IN (404, 410);

  GET DIAGNOSTICS expired_count = ROW_COUNT;

  DELETE FROM listing_url_checks c
  USING net._http_response r
  WHERE r.id = c.request_id;

  RETURN expired_count;
END;
$$;

SELECT cron.schedule(
  'dispatch_listing_url_checks',
  '0 4 * * *',
  $$SELECT dispatch_listing_url_checks()$$
);

SELECT cron.schedule(
  'process_listing_url_check_results',
  '0 5 * * *',
  $$SELECT process_listing_url_check_results()$$
);
