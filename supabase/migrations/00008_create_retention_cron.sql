-- Enable pg_cron for automated data retention
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Purge rejections older than 30 days (daily at 03:00 UTC)
SELECT cron.schedule(
  'purge_old_rejections',
  '0 3 * * *',
  $$DELETE FROM rejections WHERE created_at < now() - INTERVAL '30 days'$$
);

-- Purge run receipts older than 90 days (daily at 03:15 UTC)
SELECT cron.schedule(
  'purge_old_run_receipts',
  '15 3 * * *',
  $$DELETE FROM run_receipts WHERE started_at < now() - INTERVAL '90 days'$$
);
