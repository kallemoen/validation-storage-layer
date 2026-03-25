CREATE TABLE listings (
  listing_id           UUID PRIMARY KEY,
  source_url           VARCHAR(2000) NOT NULL,
  config_id            UUID NOT NULL REFERENCES scraper_registry(config_id),
  listing_type         VARCHAR(20) NOT NULL CHECK (listing_type IN ('sale', 'rent')),
  rent_period          VARCHAR(20) CHECK (rent_period IN ('monthly', 'weekly', 'daily')),
  listing_status       VARCHAR(20) NOT NULL DEFAULT 'active'
                       CHECK (listing_status IN ('active', 'sold', 'delisted', 'expired')),

  -- Location
  country_code         CHAR(2) NOT NULL,
  admin_level_1        VARCHAR(255),
  admin_level_2        VARCHAR(255),
  admin_level_3        VARCHAR(255),
  admin_level_4        VARCHAR(255),
  postal_code          VARCHAR(20),
  address_line_1       VARCHAR(500),
  address_line_2       VARCHAR(500),
  latitude             DECIMAL(9,6),
  longitude            DECIMAL(9,6),
  display_latitude     DECIMAL(9,6) NOT NULL,
  display_longitude    DECIMAL(9,6) NOT NULL,
  location_granularity VARCHAR(20) NOT NULL
                       CHECK (location_granularity IN (
                         'coordinates', 'address', 'postal_code',
                         'admin_level_4', 'admin_level_3', 'admin_level_2',
                         'admin_level_1', 'country'
                       )),

  -- Pricing
  price_amount         BIGINT,
  price_currency_code  CHAR(3) REFERENCES currencies(code),
  price_scraped_at     TIMESTAMPTZ,
  price_history        JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Rooms & Size
  bedrooms             SMALLINT,
  bathrooms            DECIMAL(3,1),
  total_rooms          SMALLINT,
  living_area_sqm      DECIMAL(10,2),
  plot_area_sqm        DECIMAL(12,2),
  raw_room_description VARCHAR(500),

  -- Property type
  property_type        VARCHAR(20) NOT NULL CHECK (property_type IN (
                         'house', 'apartment', 'land', 'commercial',
                         'mixed_use', 'parking', 'other'
                       )),
  property_subtype     VARCHAR(100),
  raw_property_type    VARCHAR(500),

  -- Content
  description          TEXT,
  images               JSONB,
  raw_data             JSONB NOT NULL,

  -- Timestamps
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT chk_rent_period CHECK (
    (listing_type = 'rent' AND rent_period IS NOT NULL) OR
    (listing_type = 'sale' AND rent_period IS NULL)
  ),
  CONSTRAINT chk_price_currency_pair CHECK (
    (price_amount IS NOT NULL AND price_currency_code IS NOT NULL) OR
    (price_amount IS NULL AND price_currency_code IS NULL)
  )
);
