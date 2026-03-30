import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendDailySummary } from '../../src/telegram/daily-summary.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify Vercel cron secret
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).send('Unauthorized');
  }

  try {
    await sendDailySummary();
    res.status(200).send('OK');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Daily summary failed:', message);
    res.status(500).send(`Error: ${message}`);
  }
}
