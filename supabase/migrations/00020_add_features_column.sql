-- Add features column for listing feature tags (e.g. "garage", "pool", "elevator")
ALTER TABLE listings ADD COLUMN features JSONB;
