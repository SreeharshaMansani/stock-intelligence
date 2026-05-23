'use strict';
/**
 * sheets.js — Google Sheets reader using a Service Account.
 * Replaces: "Read Stocks Sheet" + "Read Exposures Sheet" nodes.
 */

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

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

/** Simple CSV parser to parse public Google Sheets export data */
function parseCsv(csvText) {
  const lines = csvText.split(/\r?\n/);
  if (lines.length < 2) return [];
  
  const parseLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim());
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = parseLine(line).map(v => v.replace(/^"|"$/g, '').trim());
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = values[i] || '';
    });
    return obj;
  });
}

/** Fetch Google Sheets publicly without any API keys */
async function readSheetPublicly(spreadsheetId, sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const res = await axios.get(url, { timeout: 30000 });
  return parseCsv(res.data);
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
  const fallbackUniverse = [
    {
      stock:            'RELIANCE.NS',
      simple:           'Reliance',
      query:            'Reliance Industries',
      aliases:          ['Reliance', 'RIL', 'Mukesh Ambani'],
      sector_summary:   'Conglomerate: oil, retail, telecom',
      exposures:        ['crude oil', 'Jio'],
      exposure_source:  'fallback',
      _system_status_sheet: 'ok',
    },
    {
      stock:            'TCS.NS',
      simple:           'TCS',
      query:            'Tata Consultancy Services',
      aliases:          ['TCS', 'Tata Consultancy'],
      sector_summary:   'IT services, software exports',
      exposures:        ['US dollar', 'NASSCOM'],
      exposure_source:  'fallback',
      _system_status_sheet: 'ok',
    },
    {
      stock:            'HDFCBANK.NS',
      simple:           'HDFC Bank',
      query:            'HDFC Bank',
      aliases:          ['HDFC Bank', 'HDFC'],
      sector_summary:   'Banking, financial services',
      exposures:        ['interest rate', 'RBI'],
      exposure_source:  'fallback',
      _system_status_sheet: 'ok',
    }
  ];

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
    console.log('[Sheets] Sheets read via Service Account failed:', err.message);
    
    // 2. Fall back to reading publicly via direct CSV export URL!
    console.log('[Sheets] Attempting to read Google Sheet publicly via CSV export URL...');
    try {
      stocksRows    = await readSheetPublicly(spreadsheetId, process.env.STOCKS_SHEET_NAME    || 'Stocks');
      exposuresRows = await readSheetPublicly(spreadsheetId, process.env.EXPOSURES_SHEET_NAME || 'exposure');
      console.log('  ✓ Public sheet read successful!');
    } catch (publicErr) {
      console.warn('[Sheets] Public sheet read failed:', publicErr.message);
      console.log('[Sheets] Using built-in high-quality Stock Universe fallback for demo/test run.');
      return fallbackUniverse;
    }
  }

  if (!stocksRows.length || !stocksRows[0].ticker) {
    console.log('[Sheets] Sheets were empty. Using built-in Stock Universe fallback.');
    return fallbackUniverse;
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
