-- Admin level config: defines the admin level labels and depth per country
-- This is the source of truth for which countries are supported

CREATE TABLE admin_level_config (
  country_code  CHAR(2) PRIMARY KEY,
  level_1_label VARCHAR(50) NOT NULL,
  level_2_label VARCHAR(50),
  level_3_label VARCHAR(50),
  level_4_label VARCHAR(50),
  max_level     SMALLINT NOT NULL CHECK (max_level BETWEEN 1 AND 4)
);

-- Seed Portugal
INSERT INTO admin_level_config (country_code, level_1_label, level_2_label, level_3_label, level_4_label, max_level)
VALUES ('PT', 'Distrito', 'Concelho', 'Freguesia', NULL, 3);

-- RLS (default-deny, accessed via service role)
ALTER TABLE admin_level_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all" ON admin_level_config FOR ALL USING (false);
