-- Admin regions: hierarchical reference geography for validated admin levels
-- Each row is an official admin boundary (e.g., Distrito, Concelho, Freguesia for Portugal)

CREATE TABLE admin_regions (
  id            SERIAL PRIMARY KEY,
  country_code  CHAR(2) NOT NULL,
  level         SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 4),
  name          VARCHAR(255) NOT NULL,
  name_ascii    VARCHAR(255) NOT NULL,
  parent_id     INTEGER REFERENCES admin_regions(id),
  boundary      GEOMETRY(MultiPolygon, 4326),
  centroid      GEOMETRY(Point, 4326),
  external_id   VARCHAR(100),

  CONSTRAINT uq_admin_region UNIQUE (country_code, level, name, parent_id)
);

-- Indexes
CREATE INDEX idx_admin_regions_country_level ON admin_regions(country_code, level);
CREATE INDEX idx_admin_regions_parent ON admin_regions(parent_id);
CREATE INDEX idx_admin_regions_name_lookup ON admin_regions(name_ascii, country_code, level);
CREATE INDEX idx_admin_regions_boundary ON admin_regions USING GIST (boundary) WHERE boundary IS NOT NULL;

-- RLS (default-deny, accessed via service role)
ALTER TABLE admin_regions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all" ON admin_regions FOR ALL USING (false);

-- RPC function for point-in-polygon lookups from Supabase client
CREATE OR REPLACE FUNCTION find_admin_region_by_point(
  p_country_code CHAR(2),
  p_level SMALLINT,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION
) RETURNS SETOF admin_regions AS $$
  SELECT * FROM admin_regions
  WHERE country_code = p_country_code
    AND level = p_level
    AND boundary IS NOT NULL
    AND ST_Contains(boundary, ST_SetSRID(ST_Point(p_lng, p_lat), 4326))
  LIMIT 1;
$$ LANGUAGE sql STABLE;
