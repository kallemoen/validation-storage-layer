-- Pipeline-aware health tracking: new config columns, runtime columns, and updated staleness cron.
-- Replaces the single acceptance-rate health system with 6 failure mode checks.

-- 1. Add config columns (what the scraper is expected to do)
ALTER TABLE scraper_registry
  ADD COLUMN expected_discovery_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN run_interval_hours INTEGER NOT NULL DEFAULT 24;

-- 2. Add runtime health columns
ALTER TABLE scraper_registry
  ADD COLUMN last_successful_insert_at TIMESTAMPTZ,
  ADD COLUMN status_reason VARCHAR(255);

-- 3. Drop the old 24-hour hardcoded staleness cron
SELECT cron.unschedule('mark_stale_scrapers_broken');

-- 4. New hourly cron: evaluates check 6 (gone silent) and check 5 (no new listings).
--    Check 6 (broken) runs first so it takes priority over check 5 (degraded).
SELECT cron.schedule(
  'check_scraper_staleness',
  '0 * * * *',
  $$
    -- Check 6: Scraper gone silent — no activity in 2x run_interval_hours → broken
    UPDATE scraper_registry
    SET status = 'broken',
        broken_at = now(),
        status_reason = 'Scraper gone silent: no activity in ' || (run_interval_hours * 2) || ' hours'
    WHERE status IN ('active', 'degraded')
      AND run_interval_hours > 0
      AND GREATEST(
            COALESCE(last_batch_at, '1970-01-01'),
            COALESCE(last_run_at, '1970-01-01')
          ) < now() - (run_interval_hours * 2) * INTERVAL '1 hour';

    -- Check 5: No new listings stored in 3+ days → degraded
    UPDATE scraper_registry
    SET status = 'degraded',
        degraded_at = COALESCE(degraded_at, now()),
        status_reason = 'No new listings stored in 3+ days'
    WHERE status = 'active'
      AND last_successful_insert_at IS NOT NULL
      AND last_successful_insert_at < now() - INTERVAL '3 days';
  $$
);
