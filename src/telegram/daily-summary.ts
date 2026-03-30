import { queryScrapers } from '../db/scrapers.js';

/**
 * Send a daily summary report to the owner via Telegram.
 * Reads scraper data directly from the database.
 */
export async function sendDailySummary(): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    throw new Error('Missing required env vars: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID');
  }

  // Fetch all scrapers directly from DB
  const scrapers = await queryScrapers({ limit: 100 });

  const statusCounts = { active: 0, degraded: 0, broken: 0, testing: 0, paused: 0 };
  const failedRecently: string[] = [];
  let totalListings = 0;
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  for (const s of scrapers.data) {
    statusCounts[s.status as keyof typeof statusCounts]++;

    if (s.last_run_listings) totalListings += s.last_run_listings;

    if (s.last_run_status === 'failure' && s.last_run_at && new Date(s.last_run_at) > oneDayAgo) {
      failedRecently.push(`• ${s.agency_name} (${s.country_code}/${s.area_key} ${s.listing_type})`);
    }
  }

  // Build message
  const lines: string[] = [
    '📊 <b>Daily Scraper Report</b>',
    '',
    `✅ Active: ${statusCounts.active}  ⚠️ Degraded: ${statusCounts.degraded}  ❌ Broken: ${statusCounts.broken}`,
    `🧪 Testing: ${statusCounts.testing}  ⏸ Paused: ${statusCounts.paused}`,
  ];

  if (failedRecently.length > 0) {
    lines.push('', '<b>Failed in last 24h:</b>');
    lines.push(...failedRecently);
  }

  lines.push('', `📦 Total listings from last runs: ${totalListings}`);

  const message = lines.join('\n');

  // Send via Telegram Bot API
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram API error: ${res.status} ${body}`);
  }

  console.log('Daily summary sent successfully');
}
