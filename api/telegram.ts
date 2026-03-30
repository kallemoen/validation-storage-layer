import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Bot } from 'grammy';
import { createBot } from '../src/telegram/bot.js';

let bot: Bot | null = null;

function getBot(): Bot {
  if (!bot) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      throw new Error('Missing required env var: TELEGRAM_BOT_TOKEN');
    }

    bot = createBot(botToken);
  }
  return bot;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  // Verify Telegram webhook secret
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
  const secretHeader = req.headers['x-telegram-bot-api-secret-token'] as string | undefined;
  if (webhookSecret && secretHeader !== webhookSecret) {
    return res.status(401).send('Unauthorized');
  }

  try {
    const update = req.body;
    const b = getBot();
    await b.init();
    await b.handleUpdate(update);
    res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook handler error:', err);
    res.status(500).send('Internal server error');
  }
}
