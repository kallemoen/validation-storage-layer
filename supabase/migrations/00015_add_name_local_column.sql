-- Add name_local column for non-Latin script names (e.g., Greek alphabet)
-- Existing rows (PT) will have NULL since Portuguese uses Latin script.

ALTER TABLE admin_regions ADD COLUMN name_local VARCHAR(255);

CREATE INDEX idx_admin_regions_name_local ON admin_regions(name_local, country_code, level);
