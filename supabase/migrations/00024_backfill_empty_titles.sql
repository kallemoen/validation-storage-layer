-- Backfill empty titles left by 00018_add_title_column.sql.
-- Format: "<typology> in <area>"
--   typology: T-notation (T0/T1/T2/...) extracted from raw_property_type, else
--             T0 if bedrooms = 0, else a property_type-derived label.
--   area:     most-specific available admin region (admin_level_3 → 2 → 1).
UPDATE listings
SET title = (
  CASE
    WHEN raw_property_type ~* '\mT\d+\M'
      THEN upper((regexp_match(raw_property_type, 'T\d+', 'i'))[1])
    WHEN bedrooms = 0
      THEN 'T0'
    WHEN property_type = 'apartment' THEN 'Apartment'
    WHEN property_type = 'parking'   THEN 'Parking'
    WHEN property_type = 'mixed_use' THEN 'Building'
    ELSE 'Property'
  END
  || ' in '
  || coalesce(admin_level_3, admin_level_2, admin_level_1, 'Unknown')
)
WHERE title = '';
