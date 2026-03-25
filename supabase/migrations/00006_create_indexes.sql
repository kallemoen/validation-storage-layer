-- Listings indexes
CREATE UNIQUE INDEX idx_listings_source_url ON listings(source_url);
CREATE INDEX idx_listings_config_id ON listings(config_id);
CREATE INDEX idx_listings_country ON listings(country_code);
CREATE INDEX idx_listings_status ON listings(listing_status);
CREATE INDEX idx_listings_type ON listings(listing_type);
CREATE INDEX idx_listings_created ON listings(created_at);

-- Scraper registry indexes
CREATE INDEX idx_scraper_registry_status ON scraper_registry(status);
CREATE INDEX idx_scraper_registry_country ON scraper_registry(country_code);

-- Run receipts indexes
CREATE INDEX idx_run_receipts_config ON run_receipts(config_id);
CREATE INDEX idx_run_receipts_started ON run_receipts(started_at);

-- Rejections indexes
CREATE INDEX idx_rejections_config ON rejections(config_id);
CREATE INDEX idx_rejections_created ON rejections(created_at);
