'use strict';
/**
 * dashboard-server.js — Simple API Control Server
 * Built for Daily Stock Intelligence Report (Render Free Tier / Cron Trigger).
 *
 * Idempotency: /api/cron-trigger only spawns the pipeline ONCE per calendar day.
 * This makes it safe to schedule multiple cron jobs — the first successful hit
 * runs the pipeline; all subsequent hits that day are silently skipped.
 */

const http = require('http');
const { spawn } = require('child_process');

// Load environment variables
require('dotenv').config();

const PORT = parseInt(process.env.PORT || '3000', 10);

// Track the last date the pipeline was triggered (resets on container restart, which is fine)
let lastRunDate = null;

const server = http.createServer((req, res) => {
  console.log(`[HTTP] ${req.method} ${req.url}`);

  // Route: GET /wake — dedicated wake-up ping
  // Only job: confirm the server is awake. Safe to call any number of times.
  if (req.url === '/wake' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('awake');
    return;
  }

  // Route: GET /api/cron-trigger — pipeline trigger
  // Idempotent: only runs the pipeline once per calendar day (IST).
  if (req.url === '/api/cron-trigger' && req.method === 'GET') {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD in IST

    if (lastRunDate === today) {
      console.log(`[Cron-Trigger] Already ran today (${today}). Skipping duplicate trigger.`);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('already-ran-today');
      return;
    }

    lastRunDate = today;
    console.log(`[Cron-Trigger] First trigger for ${today}. Spawning pipeline run...`);

    // Respond immediately so the cron client doesn't timeout
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('okay');

    // Spawn index.js in background to execute full pipeline and send report/mail
    const isWindows = process.platform === 'win32';
    const command = isWindows ? 'node.exe' : 'node';

    const child = spawn(command, ['index.js', '--now'], {
      stdio: 'inherit',
      cwd: process.cwd()
    });

    child.on('error', (err) => {
      console.error('[Cron-Trigger] Failed to start pipeline execution:', err.message);
    });

    return;
  }

  // Fallback for all other endpoints
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

// Launch server
server.listen(PORT, () => {
  console.log('═'.repeat(60));
  console.log(`Simple Cron API Server Live at http://localhost:${PORT}`);
  console.log('═'.repeat(60));
});
