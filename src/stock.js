'use strict';
/**
 * stock.js
 * Replaces the per-stock loop nodes:
 *   Google News — Per-Stock, Parse Stock News XML, Split Stock News,
 *   Normalize GNews Items, Normalize News Item, Filter — Alias + Date,
 *   Remove Duplicates, Limit (Max 10), Score Sentiment,
 *   Aggregate Articles, Build News Bundle,
 *   Yahoo Finance, Extract Price Data,
 *   Merge — News + Price, Build Row
 */

const axios = require('axios');
const { filterSeenHeadlines } = require('./db');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const POS_WORDS = ['rise','gain','surge','profit','beat','rally','jump','climb','boost','strong','growth','upgrade','positive','record','soar','expand','outperform','bullish','momentum','win','wins','tops','approves','acquires','launches'];
const NEG_WORDS = ['fall','loss','miss','decline','drop','weakness','plunge','tumble','crash','weak','downgrade','negative','concern','risk','cut','slump','underperform','bearish','probe','fraud','penalty','fine','lawsuit','default','delay'];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function str(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return v._ || v['#'] || JSON.stringify(v);
  return String(v);
}

// ──────────────────────────────────────────────
// Google News RSS — Per Stock
// ──────────────────────────────────────────────
async function fetchStockNews(stockConfig) {
  const query = encodeURIComponent(stockConfig.query);
  const url = `https://news.google.com/rss/search?q=${query}+when:2d&hl=en-IN&gl=IN&ceid=IN:en`;
  try {
    const res = await axios.get(url, {
      headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml, */*' },
      responseType: 'text',
      timeout: 40000,
    });
    return res.data;
  } catch (err) {
    console.warn(`[Stock News] Failed for ${stockConfig.stock}:`, err.message);
    return '';
  }
}

/** Parse RSS XML and return normalized article objects */
function parseStockNews(xmlText, stockConfig) {
  if (!xmlText) return [];
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xmlText)) !== null) {
    const block = m[1];
    const titleM   = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    const linkM    = block.match(/<link>([\s\S]*?)<\/link>/);
    const descM    = block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/);
    const pubM     = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);

    const rawTitle = str(titleM ? titleM[1] : '').trim();
    if (!rawTitle) continue;

    const lastDash = rawTitle.lastIndexOf(' - ');
    const title    = lastDash > 0 ? rawTitle.substring(0, lastDash).trim() : rawTitle;
    const source   = lastDash > 0 ? rawTitle.substring(lastDash + 3).trim() : 'Google News';
    const rawDesc  = str(descM ? descM[1] : '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const pubDate  = str(pubM ? pubM[1] : '').trim();
    const pubTimestamp = pubDate ? (new Date(pubDate).getTime() || 0) : 0;

    items.push({
      stock: stockConfig.stock,
      title,
      snippet: rawDesc.slice(0, 400),
      link:    str(linkM ? linkM[1] : '').trim(),
      pubDate,
      pubTimestamp,
      source,
    });
  }
  return items;
}

/** Filter — Alias + Date (replicates n8n Filter node logic) */
function filterByAliasAndDate(articles, stockConfig) {
  const aliases = stockConfig.aliases || [];
  // Monday = weekday 1 in JS Date (getDay() === 1)
  const now = Date.now();
  const isMonday = new Date().getDay() === 1;
  const cutoffMs = now - (isMonday ? 84 : 36) * 60 * 60 * 1000;

  return articles.filter(a => {
    const text = (a.title + ' ' + (a.snippet || '')).toLowerCase();
    const hasAlias = aliases.some(alias => text.includes(alias.toLowerCase()));
    const isRecent = a.pubTimestamp >= cutoffMs;
    return hasAlias && isRecent;
  });
}

/** Score sentiment (Score Sentiment node) */
function scoreSentiment(articles) {
  return articles.map(a => {
    const text = (a.title + ' ' + (a.snippet || '')).toLowerCase();
    const p = POS_WORDS.filter(w => text.includes(w)).length;
    const n = NEG_WORDS.filter(w => text.includes(w)).length;
    const score = (p + n) === 0 ? 0 : (p - n) / (p + n);
    return { ...a, sentiment: parseFloat(score.toFixed(2)) };
  });
}

/** Aggregate + Build News Bundle (mirrors n8n Aggregate + Build News Bundle nodes) */
function buildNewsBundle(articles) {
  const titles    = articles.map(a => a.title);
  const snippets  = articles.map(a => a.snippet || '');
  const sources   = articles.map(a => a.source);
  const sentiments = articles.map(a => a.sentiment);
  const links     = articles.map(a => a.link);

  const article_count = titles.length;
  const top_headline  = titles[0] || 'No relevant news in last 36h';
  const avg_sentiment = sentiments.length === 0 ? 0 :
    parseFloat((sentiments.reduce((a, b) => a + b, 0) / sentiments.length).toFixed(2));
  const sources_csv   = [...new Set(sources)].slice(0, 5).join(', ') || 'none';
  const news_text   = article_count === 0
    ? 'No news available in last 36 hours'
    : titles.map((t, i) => `Title: ${t}\nSummary: ${snippets[i] || ''}`).join('\n\n').slice(0, 4000);

  return { article_count, top_headline, avg_sentiment, sources_csv, news_text, titles, snippets, sources: sources_csv, links };
}



// ──────────────────────────────────────────────
// Yahoo Finance Price Data
// ──────────────────────────────────────────────
async function fetchPriceData(ticker) {
  const FAILED = {
    current_price: 0, prev_close: 0,
    pct_change_1d: 0, pct_change_5d: 0,
    fifty_two_week_high: 0, fifty_two_week_low: 0,
    distance_52w_high_pct: 0, currency: 'INR', price_status: 'unavailable',
  };

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker.trim())}?interval=1d&range=10d`;
    const res = await axios.get(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      timeout: 30000,
      validateStatus: () => true,
    });

    const src = res.data;
    const result = src?.chart?.result?.[0];
    const err    = src?.chart?.error;
    if (err || !result) return FAILED;

    const meta   = result.meta || {};
    const closes = (result.indicators?.quote?.[0]?.close || []).filter(x => x != null);
    const price  = meta.regularMarketPrice || closes[closes.length - 1] || 0;
    const prev   = meta.previousClose      || closes[closes.length - 2] || 0;
    const high52 = meta.fiftyTwoWeekHigh   || 0;
    const low52  = meta.fiftyTwoWeekLow    || 0;

    if (!price || isNaN(price) || price === 0) return { ...FAILED, price_status: 'fetch_failed' };

    const pct1d = prev > 0 ? ((price / prev - 1) * 100) : 0;
    const close5dAgo = closes.length >= 6 ? closes[closes.length - 6] : closes[0];
    const pct5d = close5dAgo > 0 ? ((price / close5dAgo - 1) * 100) : 0;
    const distHigh = high52 > 0 ? ((price / high52 - 1) * 100) : 0;

    return {
      current_price:          parseFloat(price.toFixed(2)),
      prev_close:             parseFloat(prev.toFixed(2)),
      pct_change_1d:          parseFloat(pct1d.toFixed(2)),
      pct_change_5d:          parseFloat(pct5d.toFixed(2)),
      fifty_two_week_high:    parseFloat(high52.toFixed(2)),
      fifty_two_week_low:     parseFloat(low52.toFixed(2)),
      distance_52w_high_pct:  parseFloat(distHigh.toFixed(2)),
      currency:               meta.currency || 'INR',
      price_status:           'ok',
    };
  } catch (err) {
    console.warn(`[Price] Failed for ${ticker}:`, err.message);
    return FAILED;
  }
}

// ──────────────────────────────────────────────
// Main: process one stock end-to-end
// ──────────────────────────────────────────────
async function processStock(stockConfig) {
  const { stock } = stockConfig;
  console.log(`[Stock] Processing ${stock}…`);

  // 1. Fetch & parse stock news
  const xml      = await fetchStockNews(stockConfig);
  let articles   = parseStockNews(xml, stockConfig);

  // 2. Filter by alias + date
  articles = filterByAliasAndDate(articles, stockConfig);

  // 3. Dedup against previous executions (Remove Duplicates node)
  articles = filterSeenHeadlines(stock, articles);

  // 4. Limit to 10
  articles = articles.slice(0, 10);

  // 5. Score sentiment
  articles = scoreSentiment(articles);

  // 6. Build news bundle
  const bundle = buildNewsBundle(articles);

  // 7. Fetch price data
  const priceData = await fetchPriceData(stock);

  // 8. Build row (mirrors "Build Row" n8n Set node)
  const run_date = new Date().toISOString().split('T')[0];
  return {
    run_date,
    stock,
    article_count:         bundle.article_count,
    top_headline:          bundle.top_headline,
    news_text:             bundle.news_text,
    avg_sentiment:         bundle.avg_sentiment,
    current_price:         priceData.current_price,
    pct_change_1d:         priceData.pct_change_1d,
    pct_change_5d:         priceData.pct_change_5d,
    distance_52w_high_pct: priceData.distance_52w_high_pct,
    sources:               bundle.sources_csv,
    price_status:          priceData.price_status,
    // Extra context kept in memory for the Gemini prompt (not stored in DB)
    _bundle:               bundle,
    _price:                priceData,
  };
}

module.exports = { processStock };
