'use strict';
/**
 * dashboard-server.js — Simple API Control Server
 * Built for Daily Stock Intelligence Report (Oracle Free Tier / Cron Trigger).
 */

const http = require('http');
const { spawn } = require('child_process');

// Load environment variables
require('dotenv').config();

const PORT = parseInt(process.env.PORT || '3000', 10);

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
  console.log('═'.repeat(60));
});
