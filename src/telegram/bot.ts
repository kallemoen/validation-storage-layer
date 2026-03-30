import { Bot, InlineKeyboard } from 'grammy';
import { queryScrapers } from '../db/scrapers.js';
import { queryRunReceipts } from '../db/run-receipts.js';
import { getRejectionSummary } from '../db/rejections.js';

/**
 * Create and configure the bot instance with all command handlers.
 * Used by both the Vercel webhook handler and local polling entrypoint.
 *
 * The bot reads directly from the database — no HTTP client needed.
 */
export function createBot(botToken: string): Bot {
  const bot = new Bot(botToken);

  // Register commands with Telegram's menu
  bot.api.setMyCommands([
    { command: 'scrapers', description: 'Overview of all scrapers' },
    { command: 'summary', description: 'Send daily summary now' },
    { command: 'start', description: 'Show main menu' },
  ]);

  // /start command — show main menu with buttons
  bot.command('start', (ctx) => {
    const keyboard = new InlineKeyboard()
      .text('📋 Scrapers', 'cmd:scrapers').row()
      .text('📊 Daily Summary', 'cmd:summary').row();

    return ctx.reply(
      '<b>Weave Scraper Bot</b>\n\nTap a button or use the menu.',
      { parse_mode: 'HTML', reply_markup: keyboard },
    );
  });

  // /scrapers command — list with per-scraper action buttons
  bot.command('scrapers', (ctx) => handleScrapers(ctx));

  // /runs command (text-based fallback)
  bot.command('runs', async (ctx) => {
    const configId = ctx.match?.trim();
    if (!configId) return ctx.reply('Usage: /runs <config_id>\n\nOr tap a scraper button from /scrapers.');
    return handleRuns(ctx, configId);
  });

  // /rejections command (text-based fallback)
  bot.command('rejections', async (ctx) => {
    const configId = ctx.match?.trim();
    if (!configId) return ctx.reply('Usage: /rejections <config_id>\n\nOr tap a scraper button from /scrapers.');
    return handleRejections(ctx, configId);
  });

  // /summary command
  bot.command('summary', async (ctx) => {
    await ctx.reply('Sending daily summary...');
    const { sendDailySummary } = await import('./daily-summary.js');
    await sendDailySummary();
  });

  // Callback queries for all button interactions
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;

    // Main menu buttons
    if (data === 'cmd:scrapers') {
      await ctx.answerCallbackQuery();
      return handleScrapers(ctx);
    }
    if (data === 'cmd:summary') {
      await ctx.answerCallbackQuery({ text: 'Sending summary...' });
      const { sendDailySummary } = await import('./daily-summary.js');
      await sendDailySummary();
      return;
    }
    if (data === 'cmd:start') {
      await ctx.answerCallbackQuery();
      const keyboard = new InlineKeyboard()
        .text('📋 Scrapers', 'cmd:scrapers').row()
        .text('📊 Daily Summary', 'cmd:summary').row();
      return ctx.reply(
        '<b>Weave Scraper Bot</b>\n\nTap a button or use the menu.',
        { parse_mode: 'HTML', reply_markup: keyboard },
      );
    }

    // Per-scraper drill-down: show runs
    if (data.startsWith('runs:')) {
      const configId = data.slice(5);
      await ctx.answerCallbackQuery();
      return handleRuns(ctx, configId);
    }

    // Per-scraper drill-down: show rejections
    if (data.startsWith('rej:')) {
      const configId = data.slice(4);
      await ctx.answerCallbackQuery();
      return handleRejections(ctx, configId);
    }

    // Per-scraper: show action picker
    if (data.startsWith('scraper:')) {
      const configId = data.slice(8);
      await ctx.answerCallbackQuery();
      const keyboard = new InlineKeyboard()
        .text('📈 Runs', `runs:${configId}`)
        .text('❌ Rejections', `rej:${configId}`).row()
        .text('« Back to scrapers', 'cmd:scrapers').row();
      return ctx.reply(`<b>Scraper</b> <code>${configId.slice(0, 8)}...</code>`, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
    }

    await ctx.answerCallbackQuery();
  });

  return bot;
}

// --- Shared handler functions ---

async function handleScrapers(ctx: { reply: Function }) {
  const scrapers = await queryScrapers({ limit: 50 });

  if (scrapers.data.length === 0) {
    return ctx.reply('No scrapers found.');
  }

  const lines: string[] = ['<b>Scrapers</b>\n'];
  const keyboard = new InlineKeyboard();

  for (const s of scrapers.data) {
    const icon = { active: '✅', degraded: '⚠️', broken: '❌', testing: '🧪', paused: '⏸' }[s.status as string] ?? '❓';
    const rate = s.acceptance_rate != null ? ` (${(s.acceptance_rate * 100).toFixed(0)}%)` : '';
    lines.push(`${icon} <b>${s.agency_name}</b> ${s.country_code}/${s.area_key} ${s.listing_type}${rate}`);
    if ((s.status === 'degraded' || s.status === 'broken') && s.status_reason) {
      lines.push(`   <i>${s.status_reason}</i>`);
    }

    // Button for each scraper
    keyboard.text(
      `${icon} ${s.agency_name} ${s.listing_type}`,
      `scraper:${s.config_id}`,
    ).row();
  }

  keyboard.text('« Main menu', 'cmd:start').row();

  return ctx.reply(lines.join('\n'), {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });
}

async function handleRuns(ctx: { reply: Function }, configId: string) {
  const runs = await queryRunReceipts({ config_id: configId, limit: 5 });
  if (runs.data.length === 0) return ctx.reply('No run receipts found.');

  const lines: string[] = ['<b>Recent Runs</b>\n'];
  for (const r of runs.data) {
    const icon = { success: '✅', partial: '⚠️', failure: '❌' }[r.status as string] ?? '❓';
    const date = new Date(r.started_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    lines.push(`${icon} ${date}`);
    lines.push(`   🔍 ${r.urls_discovered ?? 0} discovered → ${r.urls_new ?? 0} new → ${r.listings_extracted ?? 0} extracted`);
    lines.push(`   📦 ${r.listings_submitted ?? 0} submitted → ${r.listings_accepted ?? 0} accepted, ${r.listings_rejected ?? 0} rejected`);
    if (r.failure_stage) lines.push(`   ❌ Failed at: ${r.failure_stage}`);
    if (r.error_message) lines.push(`   <i>${r.error_message}</i>`);
  }

  const keyboard = new InlineKeyboard()
    .text('❌ Rejections', `rej:${configId}`)
    .text('« Back', `scraper:${configId}`).row();

  return ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: keyboard });
}

async function handleRejections(ctx: { reply: Function }, configId: string) {
  const summary = await getRejectionSummary({ config_id: configId });
  const lines: string[] = [
    `<b>Rejection Summary</b>`,
    `Total: ${summary.total}`,
  ];

  if (summary.top_rejection_reasons.length > 0) {
    lines.push('\nTop reasons:');
    for (const r of summary.top_rejection_reasons.slice(0, 5)) {
      lines.push(`  • ${r.rule}: ${r.count}`);
    }
  }

  const keyboard = new InlineKeyboard()
    .text('📈 Runs', `runs:${configId}`)
    .text('« Back', `scraper:${configId}`).row();

  return ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: keyboard });
}
