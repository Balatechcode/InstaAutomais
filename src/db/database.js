const sqlite3 = require('sqlite3').verbose();
const config = require('../config/config');

let db = null;

function initDb() {
  if (db) return Promise.resolve(db);

  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(config.dbPath, (err) => {
      if (err) {
        console.error('Error opening SQLite database:', err.message);
        return reject(err);
      }
      console.log('Connected to SQLite database at', config.dbPath);

      const createTableSql = `
        CREATE TABLE IF NOT EXISTS news (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          raw_message TEXT,
          company TEXT,
          product TEXT,
          action TEXT,
          price_change TEXT,
          effective_date TEXT,
          source TEXT,
          title TEXT,
          content_html TEXT,
          image TEXT,
          news_id INTEGER,
          status TEXT DEFAULT 'preview',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `;

      db.run(createTableSql, (err) => {
        if (err) {
          console.error('Error creating news table:', err.message);
          return reject(err);
        }
        resolve(db);
      });
    });
  });
}

function saveNews(newsData) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO news (
        raw_message, company, product, action, price_change,
        effective_date, source, title, content_html, image, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      newsData.rawMessage || '',
      newsData.company || 'Unknown Company',
      newsData.product || 'Polymer',
      newsData.action || 'Updated',
      newsData.priceChange || '',
      newsData.effectiveDate || '',
      newsData.source || '',
      newsData.title || '',
      newsData.contentHtml || '',
      newsData.image || config.defaultImage,
      newsData.status || 'preview'
    ];

    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this.lastID);
    });
  });
}

function findDuplicate({ company, product, effectiveDate, priceChange }) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT * FROM news 
      WHERE LOWER(company) = LOWER(?)
        AND LOWER(product) = LOWER(?)
        AND LOWER(effective_date) = LOWER(?)
        AND status IN ('published', 'preview')
      ORDER BY id DESC LIMIT 1
    `;

    db.get(sql, [company, product, effectiveDate], (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function getNewsById(id) {
  return new Promise((resolve, reject) => {
    const sql = `SELECT * FROM news WHERE id = ?`;
    db.get(sql, [id], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function updateNews(id, fields) {
  return new Promise((resolve, reject) => {
    const keys = Object.keys(fields);
    if (keys.length === 0) return resolve(null);

    const setClause = keys.map((key) => `${key} = ?`).join(', ');
    const values = keys.map((key) => fields[key]);
    values.push(id);

    const sql = `UPDATE news SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    db.run(sql, values, function (err) {
      if (err) return reject(err);
      resolve(this.changes);
    });
  });
}

function updateNewsStatus(id, status, newsId = null) {
  return new Promise((resolve, reject) => {
    let sql = `UPDATE news SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    let params = [status, id];

    if (newsId !== null) {
      sql = `UPDATE news SET status = ?, news_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
      params = [status, newsId, id];
    }

    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this.changes);
    });
  });
}

function getNewsList(limit = 50) {
  return new Promise((resolve, reject) => {
    const sql = `SELECT * FROM news ORDER BY id DESC LIMIT ?`;
    db.all(sql, [limit], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function getPendingNews() {
  return new Promise((resolve, reject) => {
    const sql = `SELECT * FROM news WHERE status = 'preview' ORDER BY id DESC`;
    db.all(sql, [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

module.exports = {
  initDb,
  saveNews,
  findDuplicate,
  getNewsById,
  updateNews,
  updateNewsStatus,
  getNewsList,
  getPendingNews
};
