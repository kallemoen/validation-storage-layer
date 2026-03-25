CREATE TABLE rejections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id       UUID NOT NULL REFERENCES scraper_registry(config_id),
  mode            VARCHAR(10) NOT NULL CHECK (mode IN ('test', 'live')),
  listing_data    JSONB NOT NULL,
  tier_1_errors   JSONB NOT NULL DEFAULT '[]'::jsonb,
  tier_2_errors   JSONB NOT NULL DEFAULT '[]'::jsonb,
  tier_3_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
