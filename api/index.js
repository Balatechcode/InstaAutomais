const { createServer } = require('../src/server');
const db = require('../src/db/database');

const app = createServer();

let isDbInitialized = false;

module.exports = async (req, res) => {
  if (!isDbInitialized) {
    try {
      await db.initDb();
      isDbInitialized = true;
    } catch (err) {
      console.error(
        'Failed to initialize database on Vercel startup:',
        err
      );
    }
  }

  return app(req, res);
};