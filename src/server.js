const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const config = require('./config/config');
const db = require('./db/database');
const { parseNewsMessage } = require('./services/parser');
const { generateNewsFormat, generateTelegramPreview } = require('./services/formatter');
const { checkDuplicate } = require('./services/duplicateChecker');
const { processIncomingNewsText, handlePublishAction } = require('./bot/telegramBot');

function createServer() {
  const app = express();

  app.use(cors());
  app.use(bodyParser.json());
  app.use(express.static(path.join(__dirname, '../public')));

  // API Health Check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      mockMode: config.mockMode,
      timestamp: new Date().toISOString()
    });
  });

  // Telegram Webhook Handler (for Vercel Serverless)
  app.post('/api/telegram-webhook', async (req, res) => {
    try {
      const { setupBot } = require('./bot/telegramBot');
      const bot = setupBot();
      if (bot) {
        await bot.handleUpdate(req.body);
      }
      res.status(200).send('OK');
    } catch (err) {
      console.error('Telegram Webhook error:', err);
      res.status(500).send('Error processing webhook');
    }
  });

  // Get News List
  app.get('/api/news', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 50;
      const news = await db.getNewsList(limit);
      res.json({ success: true, count: news.length, data: news });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Parse & Process News Text (Simulates Telegram Bot receipt)
  app.post('/api/news/process', async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ success: false, error: 'Raw message text is required' });
      }

      // Step 1: Parse
      const parsed = parseNewsMessage(text);
      // Step 2: Format
      const formatted = await generateNewsFormat(parsed);
      // Step 3: Duplicate check
      const dupCheck = await checkDuplicate(parsed);

      // Save draft in DB
      const dbId = await db.saveNews({
        rawMessage: text,
        company: parsed.company,
        product: parsed.product,
        action: parsed.action,
        priceChange: parsed.priceChange,
        effectiveDate: parsed.effectiveDate,
        source: parsed.source,
        title: formatted.title,
        contentHtml: formatted.contentHtml,
        image: config.defaultImage,
        status: 'preview'
      });

      const newsRecord = await db.getNewsById(dbId);
      const telegramPreviewText = generateTelegramPreview(newsRecord);

      res.json({
        success: true,
        record: newsRecord,
        parsedData: parsed,
        formatted,
        duplicateCheck: dupCheck,
        telegramPreviewText
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Publish News API endpoint
  app.post('/api/news/:id/publish', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const result = await handlePublishAction(id);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Edit News API endpoint
  app.put('/api/news/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { title, contentHtml } = req.body;
      const fields = {};
      if (title) fields.title = title;
      if (contentHtml) fields.content_html = contentHtml;

      await db.updateNews(id, fields);
      const updated = await db.getNewsById(id);
      res.json({ success: true, record: updated });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Lazy DB init middleware for Serverless execution
  let isDbInitialized = false;
  app.use(async (req, res, next) => {
    if (!isDbInitialized) {
      try {
        await db.initDb();
        isDbInitialized = true;
      } catch (err) {
        console.error('Failed to initialize database on Vercel startup:', err);
      }
    }
    next();
  });

  return app;
}

const app = createServer();

module.exports = app;
module.exports.createServer = createServer;

