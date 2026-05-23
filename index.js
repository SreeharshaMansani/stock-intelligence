'use strict';
/**
 * index.js — Daily Stock Intelligence Report
 *
 * Faithful port of the n8n flow "Daily Stock Intelligence Report v11".
 * Designed for Oracle Cloud Free Tier (ARM Ubuntu VM).
 *
 * Run once:   node index.js --now
 * Scheduled:  node index.js          (uses CRON_SCHEDULE from .env)
 */

require('dotenv').config();
const cron = require('node-cron');

const { cleanupOldRows, insertRow, getRecentRows } = require('./src/db');
const { buildStockUniverse }                        = require('./src/sheets');
const { fetchMacroMarkets, fetchMacroNews }         = require('./src/macro');
const { buildExposureMap }                          = require('./src/exposure');
const { processStock }                              = require('./src/stock');
const { buildGeminiPrompt, generateReport, renderHtml } = require('./src/gemini');
const { sendReport }                                = require('./src/email');

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function fmtDate(d = new Date()) {
  return d.toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: process.env.TIMEZONE || 'Asia/Kolkata',
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ──────────────────────────────────────────────
// Core pipeline
// ──────────────────────────────────────────────
async function sendErrorEmail(error, phase) {
  const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--mock');
  if (isDryRun) {
    console.log(`  ⚠ Dry-run/Mock mode: Skipping failure email dispatch for error in phase [${phase}].`);
    return;
  }

  const reportDate = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: process.env.TIMEZONE || 'Asia/Kolkata',
  });

  const errorHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; background: #0f172a; margin: 0; padding: 20px; color: #f1f5f9; }
    .container { max-width: 680px; background: #1e293b; margin: 0 auto; padding: 32px; border-radius: 12px; border-top: 6px solid #ef4444; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
    .header { text-align: center; border-bottom: 1px solid #334155; padding-bottom: 16px; margin-bottom: 24px; }
    h1 { color: #f87171; font-size: 20px; margin: 0; letter-spacing: 0.5px; text-transform: uppercase; }
    .meta { font-size: 13px; color: #94a3b8; margin-top: 6px; }
    .alert-box { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 8px; padding: 16px; margin-bottom: 24px; }
    .phase-badge { display: inline-block; background: #3b82f6; color: white; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: bold; text-transform: uppercase; }
    .error-title { font-weight: bold; color: #f87171; font-size: 15px; margin-top: 10px; }
    .error-msg { font-family: monospace; background: #0f172a; padding: 12px; border-radius: 6px; font-size: 13px; color: #f1f5f9; overflow-x: auto; white-space: pre-wrap; margin-top: 8px; border: 1px solid #334155; }
    .suggestions { margin-top: 24px; font-size: 14px; line-height: 1.6; color: #cbd5e1; }
    .suggestions ul { padding-left: 20px; }
    .footer { margin-top: 32px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #334155; padding-top: 16px; }
    .stack-trace { font-family: monospace; background: #0f172a; padding: 12px; border-radius: 6px; font-size: 11px; color: #94a3b8; overflow-x: auto; white-space: pre-wrap; margin-top: 16px; max-height: 250px; border: 1px solid #334155; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚠️ Pipeline Execution Failure</h1>
      <div class="meta">Daily Stock Intelligence Bot · ${reportDate}</div>
    </div>
    
    <div class="alert-box">
      <div><span class="phase-badge">Crashed Phase</span> <strong>${phase}</strong></div>
      <div class="error-title">Exception Message:</div>
      <div class="error-msg">${error.message || error}</div>
    </div>

    <div class="suggestions">
      <strong>Actionable Recovery Suggestions:</strong>
      <ul>
        <li><strong>Credential Check:</strong> Verify Google Sheets Service Account JSON exists and <code>.env</code> has valid credentials.</li>
        <li><strong>API Health:</strong> Ensure Gemini API is available and keys are active.</li>
        <li><strong>T5 Summarizer Core:</strong> Check Hugging Face space status (could be waking up or sleeping).</li>
        <li><strong>Database Lock:</strong> Ensure SQLite file at <code>${process.env.DB_PATH || './data/stock_reports.db'}</code> is not locked by another process.</li>
      </ul>
    </div>

    <div style="margin-top: 20px;">
      <strong>Detailed Error Stack Trace:</strong>
      <div class="stack-trace">${error.stack || 'No stack trace available.'}</div>
    </div>

    <div class="footer">
      This is an automated system diagnostic alert. Please check your execution logs.
    </div>
  </div>
</body>
</html>`;

  try {
    const { sendReport } = require('./src/email');
    await sendReport(errorHtml, `${reportDate} [FAILURE ALERT]`);
    console.log('  ✓ Failure alert email sent successfully');
  } catch (emailErr) {
    console.error('  ✗ Failed to send failure alert email:', emailErr.message);
  }
}

async function run() {
  let currentPhase = 'Initialization';
  try {
    console.log('\n' + '═'.repeat(60));
    console.log(' Daily Stock Intelligence — ' + new Date().toISOString());
    console.log('═'.repeat(60));

    // ── 1. Cleanup old rows (>3 days) ─────────────────────────
    currentPhase = 'Cleanup old database rows';
    cleanupOldRows(3);

    // ── 2. Read Google Sheets → build stock universe ──────────
    currentPhase = 'Building Stock Universe';
    console.log('\n[Phase 1] Building stock universe from Google Sheets…');
    const stockUniverse = await buildStockUniverse();
    console.log(`  → ${stockUniverse.length} stock(s) loaded`);

    // ── 3. Macro context (parallel) ───────────────────────────
    currentPhase = 'Fetching Macro Context';
    console.log('\n[Phase 2] Fetching macro context…');
    const [macroMarketsResult, macroNewsResult] = await Promise.all([
      fetchMacroMarkets(),
      fetchMacroNews(),
    ]);
    const { macro_markets_text } = macroMarketsResult;
    const { macro_news_text }    = macroNewsResult;
    console.log('  → macro_status:', macroMarketsResult.macro_status);

    // ── 4. Exposure news map ───────────────────────────────────
    currentPhase = 'Fetching Exposure News';
    console.log('\n[Phase 3] Fetching exposure news…');
    const exposureMap = await buildExposureMap(stockUniverse);
    const exposureCount = Object.keys(exposureMap).length;
    console.log(`  → ${exposureCount} exposure term(s) fetched`);

    // ── 5. Per-stock loop ──────────────────────────────────────
    currentPhase = 'Processing Stocks';
    console.log('\n[Phase 4] Processing stocks…');
    const sheetFailed = stockUniverse[0]?._system_status_sheet === 'failed';

    if (!sheetFailed && stockUniverse[0]?.stock !== 'NO_STOCKS') {
      for (let i = 0; i < stockUniverse.length; i++) {
        const stockConfig = stockUniverse[i];
        try {
          const row = await processStock(stockConfig);
          // Insert into SQLite (Insert Row node)
          insertRow({
            run_date:              row.run_date,
            stock:                 row.stock,
            article_count:         row.article_count,
            top_headline:          row.top_headline,
            t5_summary:            row.t5_summary,
            avg_sentiment:         row.avg_sentiment,
            current_price:         row.current_price,
            pct_change_1d:         row.pct_change_1d,
            pct_change_5d:         row.pct_change_5d,
            distance_52w_high_pct: row.distance_52w_high_pct,
            sources:               row.sources,
            price_status:          row.price_status,
          });
          console.log(`  ✓ ${row.stock} — ${row.article_count} articles, price ₹${row.current_price} (${row.price_status})`);
        } catch (err) {
          console.error(`  ✗ ${stockConfig.stock} failed:`, err.message);
        }

        // Polite delay between stocks (avoid rate-limiting)
        if (i < stockUniverse.length - 1) await sleep(2000);
      }
    }

    // ── 6. Read rows for Gemini (last 1-3 days) ───────────────
    currentPhase = 'Reading Recent Rows';
    console.log('\n[Phase 5] Reading recent rows for report…');
    const isMonday = new Date().getDay() === 1;
    const rows = getRecentRows(isMonday ? 3 : 1);
    console.log(`  → ${rows.length} row(s) found`);

    // ── 7. Build Gemini prompt ────────────────────────────────
    currentPhase = 'Building Gemini Prompt';
    console.log('\n[Phase 6] Building Gemini prompt…');
    const { prompt, _degraded } = buildGeminiPrompt({
      rows,
      macroMarketsText: macro_markets_text,
      macroNewsText:    macro_news_text,
      exposureMap,
      stocksConfig:     stockUniverse,
    });
    console.log(`  → ${_degraded ? 'DEGRADED mode' : 'Normal mode'}, prompt length: ${prompt.length} chars`);

    // ── 8. Call Gemini ────────────────────────────────────────
    currentPhase = 'Generating Gemini Report';
    console.log('\n[Phase 7] Generating report with Gemini…');
    let reportText;
    try {
      reportText = await generateReport(prompt);
      console.log(`  → Report generated (${reportText.length} chars)`);
    } catch (err) {
      console.error('  ✗ Gemini failed:', err.message);
      reportText = `# Report Generation Failed\n\nGemini API error: ${err.message}\n\n${macro_markets_text}\n\n${macro_news_text}`;
    }

    // ── 9. Render HTML + send email ───────────────────────────
    currentPhase = 'Rendering HTML & Archiving';
    const reportDate = fmtDate();
    const html = renderHtml(reportText, reportDate);

    // Archive report locally
    let reportFilename = '';
    try {
      const fs = require('fs');
      const path = require('path');
      const reportsDir = path.resolve('./reports');
      fs.mkdirSync(reportsDir, { recursive: true });
      const runDateStr = new Date().toISOString().split('T')[0];
      reportFilename = `report_${runDateStr}.html`;
      const reportPath = path.join(reportsDir, reportFilename);
      fs.writeFileSync(reportPath, html, 'utf8');
      console.log(`  ✓ Saved local report to: ./reports/${reportFilename}`);
    } catch (err) {
      console.error('  ✗ Failed to save local report:', err.message);
    }

    currentPhase = 'Sending Email Dispatch';
    console.log('\n[Phase 8] Sending email…');
    const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--mock');
    if (isDryRun) {
      console.log(`  ⚠ Dry-run/Mock mode: Skipping email dispatch. You can open and view your beautiful HTML report directly at: ./reports/${reportFilename}`);
    } else {
      try {
        await sendReport(html, reportDate);
        console.log('  ✓ Email sent successfully');
      } catch (err) {
        console.error('  ✗ Email failed:', err.message);
      }
    }

    console.log('\n' + '─'.repeat(60));
    console.log(' Run complete at ' + new Date().toISOString());
    console.log('─'.repeat(60) + '\n');
  } catch (fatalError) {
    console.error(`\n[FATAL EXCEPTION] Pipeline failed during phase: [${currentPhase}]`);
    console.error(fatalError);
    await sendErrorEmail(fatalError, currentPhase);
    throw fatalError;
  }
}

// ──────────────────────────────────────────────
// Entry — run now or via cron
// ──────────────────────────────────────────────
if (process.argv.includes('--now')) {
  // Immediate one-shot run
  run().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
} else {
  // Scheduled run
  const schedule = process.env.CRON_SCHEDULE || '30 1 * * 1-5'; // Mon–Fri 7:00 AM IST
  const timezone = process.env.TIMEZONE      || 'Asia/Kolkata';

  console.log(`Stock Intelligence scheduler starting…`);
  console.log(`  Schedule : ${schedule}`);
  console.log(`  Timezone : ${timezone}`);
  console.log(`  Run now  : node index.js --now`);

  cron.schedule(schedule, () => {
    run().catch(err => console.error('Run error:', err));
  }, { timezone });
}
