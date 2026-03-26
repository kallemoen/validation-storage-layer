-- Add 'degraded' status and quality health columns to scraper_registry.
-- Also adds a daily cron job to mark stale scrapers as broken.

-- 1. Add 'degraded' to the status enum
ALTER TABLE scraper_registry
  DROP CONSTRAINT scraper_registry_status_check,
  ADD CONSTRAINT scraper_registry_status_check
    CHECK (status IN ('active', 'paused', 'broken', 'testing', 'degraded'));

-- 2. Add quality health columns (written by batch endpoint)
ALTER TABLE scraper_registry
  ADD COLUMN acceptance_rate REAL,
  ADD COLUMN last_batch_at TIMESTAMPTZ,
  ADD COLUMN last_batch_submitted INTEGER,
  ADD COLUMN last_batch_accepted INTEGER,
  ADD COLUMN top_rejection_rule VARCHAR(100),
  ADD COLUMN degraded_at TIMESTAMPTZ;

-- 3. Staleness detection: mark active/degraded scrapers as broken if no check-in for 24h.
-- "Check-in" = whichever is more recent of last_batch_at (batch endpoint) or last_run_at (run endpoint).
-- Runs daily at 03:30 UTC, after existing retention jobs.
SELECT cron.schedule(
  'mark_stale_scrapers_broken',
  '30 3 * * *',
  $$
    UPDATE scraper_registry
    SET status = 'broken',
        broken_at = now()
    WHERE status IN ('active', 'degraded')
      AND GREATEST(
            COALESCE(last_batch_at, '1970-01-01'),
            COALESCE(last_run_at, '1970-01-01')
          ) < now() - INTERVAL '24 hours'
  $$
);
