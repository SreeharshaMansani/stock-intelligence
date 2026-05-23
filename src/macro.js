'use strict';
/**
 * macro.js
 * Replaces: "Macro Markets — Yahoo", "Format Macro Markets",
 *           "Macro News — GNews", "Parse Macro News XML",
 *           "Split Macro News", "Format Macro News" nodes.
 */

const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ──────────────────────────────────────────────
// Macro Markets — Yahoo Finance
// ──────────────────────────────────────────────
const SYMBOLS = 'BZ%3DF,GC%3DF,INR%3DX,%5ETNX,%5ENSEI,%5EBSESN,%5EGSPC,%5EIXIC';
const NAME_MAP = {
  'BZ=F':   'Brent crude',
  'GC=F':   'Gold',
  'INR=X':  'USD/INR',
  '^TNX':   'US 10Y yield',
  '^NSEI':  'Nifty 50',
  '^BSESN': 'Sensex',
  '^GSPC':  'S&P 500',
  '^IXIC':  'Nasdaq',
};

async function fetchMacroMarkets() {
  const symbols = ['BZ=F', 'GC=F', 'INR=X', '^TNX', '^NSEI', '^BSESN', '^GSPC', '^IXIC'];
  const lines = [];

  try {
    await Promise.all(symbols.map(async symbol => {
      const label = NAME_MAP[symbol];
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
        const res = await axios.get(url, {
          headers: { 'User-Agent': UA, Accept: 'application/json' },
          timeout: 20000,
          validateStatus: () => true,
        });

        const result = res.data?.chart?.result?.[0];
        if (!result) return;

        const meta   = result.meta || {};
        const closes = (result.indicators?.quote?.[0]?.close || []).filter(x => x != null);
        const price  = meta.regularMarketPrice || closes[closes.length - 1] || 0;
        const prev   = meta.previousClose      || closes[closes.length - 2] || 0;

        if (!price) return;

        const pct = prev > 0 ? ((price / prev - 1) * 100) : 0;
        const sign = pct >= 0 ? '+' : '';
        const priceStr = ['USD/INR', 'Brent crude', 'Gold'].includes(label)
          ? price.toFixed(2)
          : Math.round(price).toLocaleString('en-IN');

        lines.push({
          symbol,
          label,
          text: `- ${label}: ${priceStr} (${sign}${pct.toFixed(2)}%)`
        });
      } catch (err) {
        console.warn(`[Macro Markets] Failed to fetch ${symbol}:`, err.message);
      }
    }));

    // Sort lines in original order to match name_map keys
    lines.sort((a, b) => symbols.indexOf(a.symbol) - symbols.indexOf(b.symbol));

    const macro_markets_text = lines.length
      ? 'MACRO MARKETS (latest close, 1-day % change):\n' + lines.map(l => l.text).join('\n')
      : 'Macro markets data unavailable today.';

    return { macro_markets_text, macro_status: lines.length ? 'ok' : 'empty' };
  } catch (err) {
    console.error('[Macro Markets] Error:', err.message);
    return { macro_markets_text: 'Macro markets data unavailable today.', macro_status: 'failed' };
  }
}

// ──────────────────────────────────────────────
// Macro News — Google News RSS
// ──────────────────────────────────────────────
const MACRO_NEWS_URL =
  'https://news.google.com/rss/search?q=(india+OR+rbi+OR+sensex+OR+nifty)+(rate+OR+inflation+OR+sanctions+OR+war+OR+crude+OR+rupee+OR+fed+OR+oil+OR+china+OR+sebi+OR+budget)+when:2d&hl=en-IN&gl=IN&ceid=IN:en';

function str(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return v._ || v['#'] || JSON.stringify(v);
  return String(v);
}

async function fetchMacroNews() {
  try {
    const res = await axios.get(MACRO_NEWS_URL, {
      headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml, */*' },
      responseType: 'text',
      timeout: 40000,
    });

    const parser = new XMLParser({ ignoreAttributes: false, cdataPropName: '__cdata' });
    const parsed = parser.parse(res.data);
    const rawItems = parsed?.rss?.channel?.item || [];
    const items = Array.isArray(rawItems) ? rawItems : [rawItems];

    if (!items.length) {
      return { macro_news_text: 'MACRO NEWS: No major macro headlines in the last 48 hours.' };
    }

    const lines = items.slice(0, 12).map(j => {
      const raw = str(j.title || j.__cdata || '').trim();
      const lastDash = raw.lastIndexOf(' - ');
      const title  = lastDash > 0 ? raw.substring(0, lastDash).trim() : raw;
      const source = lastDash > 0 ? raw.substring(lastDash + 3).trim() : 'unknown';
      return `- ${title} — ${source}`;
    });

    return {
      macro_news_text: 'MACRO NEWS (last 48h, India + global events affecting Indian markets):\n' + lines.join('\n'),
    };
  } catch (err) {
    console.error('[Macro News] Error:', err.message);
    return { macro_news_text: 'MACRO NEWS: Unavailable.' };
  }
}

module.exports = { fetchMacroMarkets, fetchMacroNews };
