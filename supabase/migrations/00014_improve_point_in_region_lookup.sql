-- Improve point-in-polygon lookup:
-- 1. Use ST_Intersects instead of ST_Contains (handles boundary edge cases)
-- 2. Add nearest-neighbor fallback within 10km for points in polygon gaps

CREATE OR REPLACE FUNCTION find_admin_region_by_point(
  p_country_code CHAR(2),
  p_level SMALLINT,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION
) RETURNS SETOF admin_regions AS $$
  WITH point AS (
    SELECT ST_SetSRID(ST_Point(p_lng, p_lat), 4326) AS geom
  ),
  exact_match AS (
    SELECT ar.* FROM admin_regions ar, point p
    WHERE ar.country_code = p_country_code
      AND ar.level = p_level
      AND ar.boundary IS NOT NULL
      AND ST_Intersects(ar.boundary, p.geom)
    LIMIT 1
  ),
  nearest_match AS (
    SELECT ar.* FROM admin_regions ar, point p
    WHERE ar.country_code = p_country_code
      AND ar.level = p_level
      AND ar.boundary IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM exact_match)
      AND ST_DWithin(ar.boundary::geography, p.geom::geography, 10000) -- 10km
    ORDER BY ST_Distance(ar.boundary::geography, p.geom::geography)
    LIMIT 1
  )
  SELECT * FROM exact_match
  UNION ALL
  SELECT * FROM nearest_match;
$$ LANGUAGE sql STABLE;
