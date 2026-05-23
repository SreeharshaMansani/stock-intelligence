'use strict';
/**
 * exposure.js
 * Replaces: "Build Exposure Universe", "Fetch Exposure News",
 *           "Parse Each Exposure", "Build Exposure Map" nodes.
 */

const axios = require('axios');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Quick regex XML parser for Google News RSS items */
function simpleXmlToItems(xmlText) {
  if (!xmlText || typeof xmlText !== 'string') return [];
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xmlText)) !== null) {
    const block = m[1];
    const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    const pubMatch   = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const raw = (titleMatch ? titleMatch[1] : '').trim();
    if (!raw) continue;
    const lastDash = raw.lastIndexOf(' - ');
    const title  = lastDash > 0 ? raw.substring(0, lastDash).trim() : raw;
    const source = lastDash > 0 ? raw.substring(lastDash + 3).trim() : 'unknown';
    items.push({ title, source, pubDate: pubMatch ? pubMatch[1].trim() : '' });
  }
  return items;
}

/**
 * Build the exposure news map: { exposure_term: [articles] }
 * Fetches RSS for each unique exposure term in parallel (batched).
 */
async function buildExposureMap(stockUniverse) {
  // Collect unique exposure terms
  const exposureSet = new Set();
  for (const stock of stockUniverse) {
    for (const e of (stock.exposures || [])) {
      if (e && typeof e === 'string' && e.trim()) exposureSet.add(e.trim());
    }
  }

  if (exposureSet.size === 0) return {};

  const terms = [...exposureSet];
  console.log(`[Exposure] Fetching news for ${terms.length} exposure terms…`);

  // Fetch in batches of 5 to avoid hammering Google News
  const BATCH = 5;
  const map = {};

  for (let i = 0; i < terms.length; i += BATCH) {
    const batch = terms.slice(i, i + BATCH);
    await Promise.all(batch.map(async term => {
      const query = encodeURIComponent(`"${term}" when:2d`);
      const url = `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`;
      try {
        const res = await axios.get(url, {
          headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml, */*' },
          responseType: 'text',
          timeout: 40000,
        });
        map[term] = simpleXmlToItems(res.data).slice(0, 3);
      } catch (err) {
        console.warn(`[Exposure] Failed for "${term}":`, err.message);
        map[term] = [];
      }
    }));

    // Small delay between batches
    if (i + BATCH < terms.length) await sleep(1000);
  }

  return map;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { buildExposureMap };
