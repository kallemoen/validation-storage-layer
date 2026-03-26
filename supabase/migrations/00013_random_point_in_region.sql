-- RPC function to generate a random point inside a region's boundary polygon.
-- Used to compute display coordinates when a scraper submits admin-level location data
-- instead of exact coordinates.

CREATE OR REPLACE FUNCTION random_point_in_region(
  p_country_code CHAR(2),
  p_level SMALLINT,
  p_name TEXT
) RETURNS TABLE(lat DOUBLE PRECISION, lng DOUBLE PRECISION) AS $$
  WITH region AS (
    SELECT boundary FROM admin_regions
    WHERE country_code = p_country_code
      AND level = p_level
      AND name = p_name
      AND boundary IS NOT NULL
    LIMIT 1
  ),
  random_pt AS (
    SELECT ST_GeneratePoints(boundary, 1) AS pts FROM region
  )
  SELECT
    ST_Y((ST_Dump(pts)).geom) AS lat,
    ST_X((ST_Dump(pts)).geom) AS lng
  FROM random_pt;
$$ LANGUAGE sql VOLATILE;
