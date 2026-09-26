const config = require('./config/config');
const db = require('./db/database');
const { setupBot, startBotPolling } = require('./bot/telegramBot');
const { createServer } = require('./server');

async function main() {
  console.log('---------------------------------------------------------');
  console.log('🚀 Starting InstaPrice Polymer News Automation System...');
  console.log('---------------------------------------------------------');

  try {
    // 1. Initialize SQLite Database
    await db.initDb();

    // 2. Initialize Telegram Bot
    const bot = setupBot();
    if (bot) {
      startBotPolling();
    } else {
      console.log('ℹ️  Telegram Bot Token not configured. Running in Mock/Web API mode.');
    }

    // 3. Initialize Express Web Server
    const app = createServer();
    app.listen(config.port, () => {
      console.log(`🌐 Server running at: http://localhost:${config.port}`);
      console.log(`📊 Dashboard UI:     http://localhost:${config.port}`);
      console.log(`⚙️  Mock API Mode:   ${config.mockMode ? 'ENABLED (Local sandbox)' : 'DISABLED (Live InstaPrice API)'}`);
      console.log('---------------------------------------------------------');
    });
  } catch (err) {
    console.error('❌ System startup failed:', err.message);
    process.exit(1);
  }
}

main();
