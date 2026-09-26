const path = require('path');
require('dotenv').config();

const isVercel = process.env.VERCEL || process.env.NOW_BUILDER;

module.exports = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
  apiBaseUrl: process.env.INSTAPRICE_API_BASE_URL || 'https://instaprice.co.in/rest/V1',
  apiToken: process.env.INSTAPRICE_API_TOKEN || 'ENV_TOKEN',
  defaultImage: process.env.DEFAULT_NEWS_IMAGE || 'instaprice-default.png',
  port: parseInt(process.env.PORT, 10) || 3000,
  mockMode: process.env.MOCK_MODE === 'true' || !process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN === 'YOUR_TELEGRAM_BOT_TOKEN',
  geminiApiKey: process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || '',
  dbPath: isVercel ? path.join('/tmp', 'database.sqlite') : path.join(__dirname, '../../database.sqlite')
};

