-- Add required title column to listings
ALTER TABLE listings ADD COLUMN title VARCHAR(500);
UPDATE listings SET title = '' WHERE title IS NULL;
ALTER TABLE listings ALTER COLUMN title SET NOT NULL;
