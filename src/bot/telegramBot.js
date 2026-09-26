const { Telegraf, Markup } = require('telegraf');
const config = require('../config/config');
const db = require('../db/database');
const { parseNewsMessage } = require('../services/parser');
const { generateNewsFormat, generateTelegramPreview } = require('../services/formatter');
const { checkDuplicate } = require('../services/duplicateChecker');
const { createNews, publishNews } = require('../services/instapriceApi');

let bot = null;

// In-memory active edit sessions { chatId: newsRecordId }
const userEditSessions = new Map();

function setupBot() {
  if (!config.telegramToken || config.telegramToken === 'YOUR_TELEGRAM_BOT_TOKEN') {
    console.log('[BOT] Telegram Bot Token not set or set to default. Running in Standalone Web/Mock Mode.');
    return null;
  }

  bot = new Telegraf(config.telegramToken);

  // Command /start
  bot.command('start', async (ctx) => {
    const welcomeMsg = `🤖 *InstaPrice Polymer News Automation Bot*

Send or forward any WhatsApp polymer price update text to this bot.
The bot will automatically:
1. Extract Company, Product, Action & Price Details
2. Generate Standard InstaPrice HTML Formatting
3. Check for Duplicate News
4. Show preview with 1-click **Publish / Edit / Cancel** options.

Commands:
/pending - View pending news drafts
/news - View recent news logs
/help - Show help instructions`;

    await ctx.replyWithMarkdown(welcomeMsg);
  });

  // Command /help
  bot.command('help', async (ctx) => {
    const helpMsg = `ℹ️ *Help & Usage Guide*

• *Forward WhatsApp News*: Just paste or forward the raw text here.
• *Preview & Publish*: Click *✅ PUBLISH* on the preview message to push live to InstaPrice.
• *Duplicate Detection*: The system warns if a matching news record already exists.

For support or admin settings, visit the web dashboard at \`http://localhost:${config.port}\`.`;

    await ctx.replyWithMarkdown(helpMsg);
  });

  // Command /pending
  bot.command('pending', async (ctx) => {
    try {
      const pendingList = await db.getPendingNews();
      if (pendingList.length === 0) {
        return ctx.reply('ℹ️ No pending news drafts awaiting preview approval.');
      }

      await ctx.reply(`📋 *Pending News Drafts (${pendingList.length}):*`, { parse_mode: 'Markdown' });
      for (const item of pendingList) {
        await sendPreviewToChat(ctx.chat.id, item);
      }
    } catch (err) {
      await ctx.reply(`❌ Error fetching pending news: ${err.message}`);
    }
  });

  // Command /news
  bot.command('news', async (ctx) => {
    try {
      const newsList = await db.getNewsList(10);
      if (newsList.length === 0) {
        return ctx.reply('ℹ️ No news records found in history.');
      }

      let text = `📜 *Recent News History (Last 10):*\n\n`;
      newsList.forEach((n, idx) => {
        const icon = n.status === 'published' ? '✅' : n.status === 'cancelled' ? '❌' : '⏳';
        text += `${idx + 1}. ${icon} *[ID: ${n.news_id || n.id}]* ${n.title}\nStatus: _${n.status}_\n\n`;
      });

      await ctx.replyWithMarkdown(text);
    } catch (err) {
      await ctx.reply(`❌ Error listing news: ${err.message}`);
    }
  });

  // Command /cancel
  bot.command('cancel', async (ctx) => {
    if (userEditSessions.has(ctx.chat.id)) {
      userEditSessions.delete(ctx.chat.id);
      return ctx.reply('❌ Active edit session cancelled.');
    }
    ctx.reply('ℹ️ No active edit session to cancel.');
  });

  // Text message handler
  bot.on('text', async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text.trim();

    // Ignore commands
    if (text.startsWith('/')) return;

    // Check if user is in Edit Mode
    if (userEditSessions.has(chatId)) {
      const newsDbId = userEditSessions.get(chatId);
      userEditSessions.delete(chatId);

      await db.updateNews(newsDbId, {
        title: text,
        updated_at: new Date().toISOString()
      });

      const updatedRecord = await db.getNewsById(newsDbId);
      await ctx.reply('✏️ Title updated successfully!');
      await sendPreviewToChat(chatId, updatedRecord);
      return;
    }

    // Process raw WhatsApp message
    await processIncomingNewsText(text, chatId, ctx);
  });

  // Callback Query handlers
  bot.action(/^publish_(\d+)$/, async (ctx) => {
    const dbId = parseInt(ctx.match[1], 10);
    await handlePublishAction(dbId, ctx);
  });

  bot.action(/^publish_anyway_(\d+)$/, async (ctx) => {
    const dbId = parseInt(ctx.match[1], 10);
    await handlePublishAction(dbId, ctx);
  });

  bot.action(/^edit_(\d+)$/, async (ctx) => {
    const dbId = parseInt(ctx.match[1], 10);
    const chatId = ctx.chat.id;
    userEditSessions.set(chatId, dbId);

    await ctx.answerCbQuery('Edit Mode Activated');
    await ctx.reply(`✏️ *EDIT MODE*\n\nPlease send the new *Title* for this news item.\n\n_Type /cancel to discard editing._`, { parse_mode: 'Markdown' });
  });

  bot.action(/^cancel_(\d+)$/, async (ctx) => {
    const dbId = parseInt(ctx.match[1], 10);
    await db.updateNewsStatus(dbId, 'cancelled');
    await ctx.answerCbQuery('News draft cancelled');
    await ctx.editMessageText('❌ *NEWS CANCELLED*\nThis news draft was cancelled and will not be published.', { parse_mode: 'Markdown' });
  });

  return bot;
}

/**
 * Processing engine for news incoming text message.
 */
async function processIncomingNewsText(rawText, chatId = null, ctx = null) {
  try {
    if (ctx) {
      await ctx.reply(`📩 *New News Received*\n\n${rawText}`, { parse_mode: 'Markdown' });
    }

    // 1. Data extraction
    const extracted = parseNewsMessage(rawText);

    // 2. Format Generation
    const formatted = await generateNewsFormat(extracted);

    // 3. Save draft to DB
    const dbId = await db.saveNews({
      rawMessage: rawText,
      company: extracted.company,
      product: extracted.product,
      action: extracted.action,
      priceChange: extracted.priceChange,
      effectiveDate: extracted.effectiveDate,
      source: extracted.source,
      title: formatted.title,
      contentHtml: formatted.contentHtml,
      image: config.defaultImage,
      status: 'preview'
    });

    const newsRecord = await db.getNewsById(dbId);

    // 4. Duplicate Check
    const dupCheck = await checkDuplicate(extracted);

    if (dupCheck.isDuplicate) {
      const dupMessage = `⚠️ *Duplicate News Detected*\n\nSimilar news already exists.\n*News ID:* ${dupCheck.existingNews.news_id || dupCheck.existingNews.id}\n*Title:* ${dupCheck.existingNews.title}`;

      const buttons = Markup.inlineKeyboard([
        [Markup.button.callback('✅ Publish Anyway', `publish_anyway_${dbId}`)],
        [Markup.button.callback('❌ Cancel', `cancel_${dbId}`)]
      ]);

      if (ctx) {
        await ctx.replyWithMarkdown(dupMessage, buttons);
      }
      return { newsRecord, isDuplicate: true, existingNews: dupCheck.existingNews };
    }

    // 5. Send Preview
    if (chatId) {
      await sendPreviewToChat(chatId, newsRecord);
    }

    return { newsRecord, isDuplicate: false };
  } catch (err) {
    console.error('Error processing incoming news text:', err);
    if (ctx) {
      await ctx.reply(`❌ Parsing Error: ${err.message}`);
    }
    throw err;
  }
}

/**
 * Sends preview card with inline buttons to Telegram chat.
 */
async function sendPreviewToChat(chatId, newsRecord) {
  if (!bot) return;

  const previewText = generateTelegramPreview(newsRecord);
  const buttons = Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ PUBLISH', `publish_${newsRecord.id}`),
      Markup.button.callback('✏️ EDIT', `edit_${newsRecord.id}`),
      Markup.button.callback('❌ CANCEL', `cancel_${newsRecord.id}`)
    ]
  ]);

  await bot.telegram.sendMessage(chatId, previewText, {
    parse_mode: 'Markdown',
    ...buttons
  });
}

/**
 * Handles Publish step (Creates news via API -> Publishes via API -> Updates DB -> Sends confirmation).
 */
async function handlePublishAction(dbId, ctx = null) {
  try {
    const newsRecord = await db.getNewsById(dbId);
    if (!newsRecord) throw new Error('News record not found');

    if (ctx) await ctx.answerCbQuery('Publishing news to InstaPrice...');

    // Step 7: Create News API
    const createResult = await createNews({
      title: newsRecord.title,
      newsHtml: newsRecord.content_html,
      image: newsRecord.image
    });

    const newsId = createResult.news_id;

    // Step 8: Publish News API
    const publishResult = await publishNews({ newsId });

    // Update status in DB
    await db.updateNewsStatus(dbId, 'published', newsId);

    const confirmationMsg = `✅ *NEWS PUBLISHED*

*News ID:* ${newsId}

${newsRecord.title}

*Status:* Published${createResult.isMock ? ' (Mock Mode)' : ''}`;

    if (ctx) {
      await ctx.editMessageText(confirmationMsg, { parse_mode: 'Markdown' });
    }

    return { success: true, newsId, publishResult };
  } catch (err) {
    console.error(`Error publishing news ID ${dbId}:`, err.message);
    if (ctx) {
      await ctx.reply(`❌ *Publish Failed:* ${err.message}`, { parse_mode: 'Markdown' });
    }
    throw err;
  }
}

function startBotPolling() {
  if (bot) {
    bot.launch()
      .then(() => console.log('🤖 Telegram Bot started polling successfully.'))
      .catch((err) => console.error('Error starting Telegram Bot polling:', err.message));

    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  }
}

module.exports = {
  setupBot,
  startBotPolling,
  processIncomingNewsText,
  sendPreviewToChat,
  handlePublishAction
};
