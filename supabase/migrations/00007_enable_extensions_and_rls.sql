-- Enable PostGIS for future geospatial queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- Enable RLS on all tables (default deny)
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraper_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rejections ENABLE ROW LEVEL SECURITY;
ALTER TABLE currencies ENABLE ROW LEVEL SECURITY;

-- Default deny policies (service role bypasses RLS)
CREATE POLICY "deny_all" ON listings FOR ALL USING (false);
CREATE POLICY "deny_all" ON scraper_registry FOR ALL USING (false);
CREATE POLICY "deny_all" ON run_receipts FOR ALL USING (false);
CREATE POLICY "deny_all" ON rejections FOR ALL USING (false);
CREATE POLICY "deny_all" ON currencies FOR ALL USING (false);
