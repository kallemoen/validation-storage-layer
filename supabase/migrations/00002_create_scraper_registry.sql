CREATE TABLE scraper_registry (
  config_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_name       VARCHAR(255) NOT NULL,
  country_code      CHAR(2)      NOT NULL,
  area_key          VARCHAR(255) NOT NULL,
  listing_type      VARCHAR(20)  NOT NULL CHECK (listing_type IN ('sale', 'rent')),
  status            VARCHAR(20)  NOT NULL DEFAULT 'testing'
                    CHECK (status IN ('active', 'paused', 'broken', 'testing')),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_run_at       TIMESTAMPTZ,
  last_run_status   VARCHAR(20)  CHECK (last_run_status IN ('success', 'partial', 'failure')),
  last_run_listings INTEGER,
  failure_count     SMALLINT     NOT NULL DEFAULT 0,
  broken_at         TIMESTAMPTZ,
  repair_count      SMALLINT     NOT NULL DEFAULT 0,
  config            JSONB        NOT NULL
);
