CREATE TABLE run_receipts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id           UUID NOT NULL REFERENCES scraper_registry(config_id),
  started_at          TIMESTAMPTZ NOT NULL,
  completed_at        TIMESTAMPTZ NOT NULL,
  status              VARCHAR(20) NOT NULL CHECK (status IN ('success', 'partial', 'failure')),
  failure_stage       VARCHAR(20) CHECK (failure_stage IN ('discovery', 'extraction', 'validation')),
  urls_discovered     INTEGER,
  urls_new            INTEGER,
  listings_extracted  INTEGER,
  listings_submitted  INTEGER,
  listings_accepted   INTEGER,
  listings_rejected   INTEGER,
  error_message       TEXT
);
