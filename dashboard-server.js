'use strict';
/**
 * dashboard-server.js — Simple API Control Server
 * Built for Daily Stock Intelligence Report (Render Free Tier / Cron Trigger).
 *
 * Keep-alive: pings /wake every 14 min so Render never idles the container.
 */

const http = require('http');
const https = require('https');
const { spawn } = require('child_process');

// Load environment variables
require('dotenv').config();

const PORT = parseInt(process.env.PORT || '3000', 10);

// ─── Keep-Alive Self-Ping ────────────────────────────────────────────────────
// Render free tier sleeps after 15 min of inactivity.
// We ping our own /wake endpoint every 14 min to stay awake 24/7.
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || process.env.RENDER_URL || null;

function selfPing() {
  if (!RENDER_URL) {
    // Running locally — no need to self-ping
    return;
  }
  const pingUrl = `${RENDER_URL}/wake`;
  const client = pingUrl.startsWith('https') ? https : http;
  const req = client.get(pingUrl, (res) => {
    console.log(`[Keep-Alive] Pinged ${pingUrl} → HTTP ${res.statusCode}`);
    res.resume(); // discard response body
  });
  req.on('error', (err) => {
    console.warn(`[Keep-Alive] Ping failed: ${err.message}`);
  });
  req.setTimeout(10000, () => {
    req.destroy();
    console.warn('[Keep-Alive] Ping timed out after 10s');
  });
}

// Start keep-alive loop 30 seconds after boot, then every 14 minutes
setTimeout(() => {
  selfPing(); // first ping
  setInterval(selfPing, 14 * 60 * 1000); // every 14 min
}, 30 * 1000);
// ────────────────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  console.log(`[HTTP] ${req.method} ${req.url}`);

  // Route: GET /wake — dedicated wake-up ping (Job 1 on cron-job.org)
  // This endpoint's only job is to boot Render. Failure/timeout here is expected and fine.
  if (req.url === '/wake' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('awake');
    return;
  }

  // Route: GET /api/cron-trigger — pipeline trigger (Job 2 on cron-job.org, 3 min after /wake)
  if (req.url === '/api/cron-trigger' && req.method === 'GET') {
    console.log('[Cron-Trigger] Received external trigger request. Spawning pipeline run...');
    
    // Respond with a simple "okay" to the cron client immediately
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

  // Fallback for all other endpoints (including HTML requests)
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

// Launch server
server.listen(PORT, () => {
  console.log('═'.repeat(60));
  console.log(`Simple Cron API Server Live at http://localhost:${PORT}`);
  if (RENDER_URL) {
    console.log(`Keep-Alive enabled → pinging ${RENDER_URL}/wake every 14 min`);
  } else {
    console.log('Keep-Alive disabled (set RENDER_EXTERNAL_URL env var to enable)');
  }
  console.log('═'.repeat(60));
});
