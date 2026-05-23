'use strict';
/**
 * db.js — SQLite wrapper replacing n8n's dataTable node.
 * Tables:
 *   stock_reports  — one row per (run_date, stock) run
 *   seen_headlines — dedup store for "Remove Duplicates" node logic
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let _db = null;

function getDb() {
  if (_db) return _db;

  const dbPath = path.resolve(process.env.DB_PATH || './data/stock_reports.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS stock_reports (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      run_date            TEXT NOT NULL,
      stock               TEXT NOT NULL,
      article_count       INTEGER DEFAULT 0,
      top_headline        TEXT,
      t5_summary          TEXT,
      avg_sentiment       REAL DEFAULT 0,
      current_price       REAL DEFAULT 0,
      pct_change_1d       REAL DEFAULT 0,
      pct_change_5d       REAL DEFAULT 0,
      distance_52w_high_pct REAL DEFAULT 0,
      sources             TEXT,
      price_status        TEXT,
      created_at          TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_run_date ON stock_reports(run_date);
    CREATE INDEX IF NOT EXISTS idx_stock    ON stock_reports(stock);

    CREATE TABLE IF NOT EXISTS seen_headlines (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      stock      TEXT NOT NULL,
      title_hash TEXT NOT NULL,
      seen_at    TEXT DEFAULT (datetime('now')),
      UNIQUE(stock, title_hash)
    );
  `);

  return _db;
}

/** Delete rows older than N days (Cleanup Old Rows node) */
function cleanupOldRows(days = 3) {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const info = db.prepare(`DELETE FROM stock_reports WHERE run_date < ?`).run(cutoffStr);
  console.log(`[DB] Cleaned up ${info.changes} rows older than ${cutoffStr}`);

  // Also prune old seen_headlines (keep 7 days)
  const cutoff7 = new Date();
  cutoff7.setDate(cutoff7.getDate() - 7);
  db.prepare(`DELETE FROM seen_headlines WHERE seen_at < ?`).run(cutoff7.toISOString());
}

/** Insert a row (Insert Row node) */
function insertRow(row) {
  const db = getDb();
  db.prepare(`
    INSERT INTO stock_reports
      (run_date, stock, article_count, top_headline, t5_summary,
       avg_sentiment, current_price, pct_change_1d, pct_change_5d,
       distance_52w_high_pct, sources, price_status)
    VALUES
      (@run_date, @stock, @article_count, @top_headline, @t5_summary,
       @avg_sentiment, @current_price, @pct_change_1d, @pct_change_5d,
       @distance_52w_high_pct, @sources, @price_status)
  `).run(row);
}

/** Get rows from last N days (Get Rows node) */
function getRecentRows(days = 3) {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  return db.prepare(`SELECT * FROM stock_reports WHERE run_date >= ? ORDER BY run_date DESC`).all(cutoffStr);
}

/** Dedup check — returns only articles not seen in previous executions */
function filterSeenHeadlines(stock, articles) {
  const db = getDb();
  const insert = db.prepare(`INSERT OR IGNORE INTO seen_headlines (stock, title_hash) VALUES (?, ?)`);

  return articles.filter(article => {
    // simple hash: lowercase title stripped of spaces
    const hash = (article.title || '').toLowerCase().replace(/\s+/g, '').slice(0, 120);
    if (!hash) return false;
    const info = insert.run(stock, hash);
    // changes === 1 means it was new (not seen before)
    return info.changes === 1;
  });
}

module.exports = { cleanupOldRows, insertRow, getRecentRows, filterSeenHeadlines };
