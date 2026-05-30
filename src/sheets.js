'use strict';
/**
 * sheets.js — Google Sheets reader using a Service Account.
 * Replaces: "Read Stocks Sheet" + "Read Exposures Sheet" nodes.
 */

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');


let _auth = null;

async function getAuth() {
  if (_auth) return _auth;
  const keyFile = path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || './google-service-account.json');
  _auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return _auth;
}



/**
 * Read a sheet tab and return array of objects keyed by header row.
 * @param {string} sheetName  - Tab name, e.g. "Stocks" or "exposure"
 * @returns {Array<Object>}
 */
async function readSheet(sheetName) {
  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.SPREADSHEET_ID;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetName,
  });

  const rows = res.data.values || [];
  if (rows.length < 2) return [];

  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] || ''; });
    return obj;
  });
}

/**
 * Read both sheets and build the stock universe.
 * Mirrors "Build Stock Universe" n8n Code node.
 */
async function buildStockUniverse() {
  let stocksRows, exposuresRows;
  const spreadsheetId = process.env.SPREADSHEET_ID || '1DnVNDKMh2odj4rjLaTD8N0rYf_BiPyvvuA9DtCFHpfI';

  // 1. Try Live Sheets API (using Service Account Key)
  try {
    const keyFile = path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || './google-service-account.json');
    if (!fs.existsSync(keyFile)) {
      throw new Error(`Key file missing at ${keyFile}`);
    }
    stocksRows    = await readSheet(process.env.STOCKS_SHEET_NAME    || 'Stocks');
    exposuresRows = await readSheet(process.env.EXPOSURES_SHEET_NAME || 'exposure');
  } catch (err) {
    console.error('[Sheets] Google Sheets API read failed:', err.message);
    throw new Error(`Google Sheets API read failed: ${err.message}`);
  }

  if (!stocksRows.length || !stocksRows[0].ticker) {
    throw new Error('Google Sheets read returned empty or invalid stock rows');
  }

  // Build exposures map: ticker → [exposure_terms]
  const expMap = {};
  for (const er of exposuresRows) {
    const t = er.ticker;
    const e = er.exposure_term;
    if (!t || !e) continue;
    if (!expMap[t]) expMap[t] = [];
    expMap[t].push(e);
  }

  return stocksRows
    .filter(row => row.ticker)
    .map(row => {
      let aliasesParsed = [];
      try { aliasesParsed = JSON.parse(row.aliases || '[]'); } catch { aliasesParsed = []; }

      const exposures = expMap[row.ticker] || [];
      return {
        stock:            row.ticker,
        simple:           row.simple || '',
        query:            row.query  || '',
        aliases:          aliasesParsed,
        sector_summary:   row.sector_summary || '',
        exposures,
        exposure_source:  exposures.length > 0 ? 'sheet' : 'empty',
        _system_status_sheet: 'ok',
      };
    });
}

module.exports = { buildStockUniverse };
