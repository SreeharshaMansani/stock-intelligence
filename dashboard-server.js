'use strict';
/**
 * dashboard-server.js — Premium Web Dashboard & Control Center
 * Built for Daily Stock Intelligence Report.
 * Native HTTP server (zero external dependencies).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Load environment variables from .env
require('dotenv').config();

const PORT = parseInt(process.env.PORT || '3000', 10);
const REPORTS_DIR = path.resolve('./reports');
const ENV_PATH = path.resolve('./.env');
const ENV_EXAMPLE_PATH = path.resolve('./.env.example');

// Ensure reports directory exists
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

// ──────────────────────────────────────────────
// Helper: Serve HTML Dashboard Source
// ──────────────────────────────────────────────
const HTML_CONTENT = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Stock Intelligence Control Center</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-color: hsl(222, 47%, 6%);
      --surface-color: rgba(17, 24, 39, 0.7);
      --surface-border: rgba(255, 255, 255, 0.08);
      --primary-color: hsl(15, 100%, 65%);
      --primary-glow: hsla(15, 100%, 65%, 0.35);
      --text-main: hsl(210, 40%, 96%);
      --text-muted: hsl(215, 20%, 65%);
      --success: hsl(142, 72%, 40%);
      --warning: hsl(38, 92%, 50%);
      --danger: hsl(350, 80%, 55%);
      --card-bg: rgba(26, 36, 53, 0.55);
      --transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg-color);
      background-image: radial-gradient(circle at 10% 20%, rgba(30, 41, 59, 0.4) 0%, transparent 60%),
                        radial-gradient(circle at 90% 80%, rgba(120, 50, 20, 0.15) 0%, transparent 50%);
      color: var(--text-main);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      overflow-x: hidden;
    }

    /* Modern Scrollbars */
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.2); }
    ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.3); }

    /* Layout & Header */
    header {
      background: rgba(10, 15, 30, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--surface-border);
      padding: 16px 40px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 100;
    }

    .logo-container {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .logo-badge {
      background: linear-gradient(135deg, var(--primary-color), hsl(5, 90%, 55%));
      box-shadow: 0 0 15px var(--primary-glow);
      color: #000;
      font-weight: 700;
      padding: 6px 12px;
      border-radius: 8px;
      letter-spacing: 0.5px;
      font-size: 14px;
    }

    h1 {
      font-size: 20px;
      font-weight: 600;
      letter-spacing: -0.5px;
      background: linear-gradient(to right, #fff, var(--text-muted));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .nav-tabs {
      display: flex;
      gap: 6px;
      background: rgba(0, 0, 0, 0.3);
      padding: 4px;
      border-radius: 10px;
      border: 1px solid var(--surface-border);
    }

    .tab-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: 8px 16px;
      font-family: inherit;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      border-radius: 8px;
      transition: var(--transition);
    }

    .tab-btn:hover {
      color: var(--text-main);
      background: rgba(255, 255, 255, 0.05);
    }

    .tab-btn.active {
      color: #000;
      background: var(--primary-color);
      box-shadow: 0 0 10px var(--primary-glow);
      font-weight: 600;
    }

    /* Main Container */
    main {
      flex: 1;
      padding: 30px 40px;
      max-width: 1400px;
      width: 100%;
      margin: 0 auto;
    }

    .tab-panel {
      display: none;
      animation: fadeIn 0.4s ease forwards;
    }

    .tab-panel.active {
      display: block;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Grid & Cards */
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1.2fr;
      gap: 30px;
    }

    @media(max-width: 1024px) {
      .grid-2 { grid-template-columns: 1fr; }
    }

    .glass-card {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--surface-border);
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      margin-bottom: 24px;
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      padding-bottom: 12px;
    }

    .card-title {
      font-size: 16px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--primary-color);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: var(--text-main);
      padding: 10px 20px;
      border-radius: 10px;
      font-family: inherit;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: var(--transition);
    }

    .btn:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.15);
      border-color: rgba(255, 255, 255, 0.2);
      transform: translateY(-1px);
    }

    .btn:active:not(:disabled) {
      transform: translateY(0);
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-primary {
      background: linear-gradient(135deg, var(--primary-color), hsl(5, 90%, 55%));
      color: #000;
      font-weight: 600;
      border: none;
      box-shadow: 0 4px 15px rgba(255, 109, 90, 0.2);
    }

    .btn-primary:hover:not(:disabled) {
      background: linear-gradient(135deg, hsl(15, 100%, 70%), hsl(5, 90%, 60%));
      box-shadow: 0 6px 20px rgba(255, 109, 90, 0.4);
    }

    .btn-success {
      background: var(--success);
      color: #fff;
      border: none;
    }
    .btn-success:hover {
      background: hsl(142, 72%, 46%);
    }

    /* Retro Terminal */
    .terminal-container {
      background: #050b14;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 16px;
      height: 400px;
      display: flex;
      flex-direction: column;
      box-shadow: inset 0 0 15px rgba(0, 0, 0, 0.8);
    }

    .terminal-header {
      display: flex;
      align-items: center;
      gap: 6px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      margin-bottom: 12px;
    }

    .dot { width: 10px; height: 10px; border-radius: 50%; }
    .dot-red { background: var(--danger); }
    .dot-yellow { background: var(--warning); }
    .dot-green { background: var(--success); }

    .terminal-title {
      font-family: 'Fira Code', monospace;
      font-size: 11px;
      color: var(--text-muted);
      margin-left: 6px;
    }

    .terminal-body {
      flex: 1;
      font-family: 'Fira Code', 'Courier New', monospace;
      font-size: 13px;
      line-height: 1.6;
      color: hsl(120, 100%, 75%);
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
      padding-right: 6px;
    }

    .terminal-line { margin-bottom: 4px; }
    .terminal-err { color: var(--danger); }
    .terminal-system { color: var(--text-muted); }

    /* Report Layout */
    .report-split {
      display: grid;
      grid-template-columns: 280px 1fr;
      gap: 30px;
      height: calc(100vh - 180px);
    }

    @media(max-width: 768px) {
      .report-split { grid-template-columns: 1fr; height: auto; }
    }

    .report-sidebar {
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid var(--surface-border);
      border-radius: 12px;
      padding: 16px;
      overflow-y: auto;
    }

    .report-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .report-item {
      padding: 12px 16px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 10px;
      cursor: pointer;
      transition: var(--transition);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .report-item:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.1);
    }

    .report-item.active {
      border-color: var(--primary-color);
      background: rgba(255, 109, 90, 0.08);
    }

    .report-date { font-weight: 600; font-size: 14px; color: var(--text-main); }
    .report-meta { font-size: 11px; color: var(--text-muted); }

    .report-frame-container {
      background: #fff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
      height: 100%;
      border: 1px solid var(--surface-border);
      position: relative;
    }

    .report-frame {
      width: 100%;
      height: 100%;
      border: none;
      background: #f4f7f6;
    }

    /* Configuration Panel Form */
    .config-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }

    @media(max-width: 768px) {
      .config-grid { grid-template-columns: 1fr; }
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
    }

    label {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    input, textarea, select {
      background: rgba(0, 0, 0, 0.35);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: var(--text-main);
      padding: 12px;
      border-radius: 10px;
      font-family: inherit;
      font-size: 14px;
      transition: var(--transition);
      width: 100%;
    }

    input:focus, textarea:focus, select:focus {
      outline: none;
      border-color: var(--primary-color);
      box-shadow: 0 0 8px var(--primary-glow);
      background: rgba(0, 0, 0, 0.5);
    }

    .form-help {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 2px;
    }

    /* Status and Quick Cards */
    .stats-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 20px;
      margin-bottom: 24px;
    }

    .stat-card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--surface-border);
      border-radius: 12px;
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .stat-label { font-size: 11px; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.5px; }
    .stat-value { font-size: 20px; font-weight: 600; color: var(--text-main); }
    .stat-indicator { font-size: 11px; font-weight: 500; display: flex; align-items: center; gap: 4px; }
    .stat-ok { color: var(--success); }
    .stat-degraded { color: var(--warning); }

    /* Toast Notification */
    .toast {
      position: fixed;
      bottom: 30px;
      right: 30px;
      background: #111827;
      border: 1px solid var(--success);
      color: var(--text-main);
      padding: 16px 24px;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
      z-index: 1000;
      transform: translateY(100px);
      opacity: 0;
      transition: var(--transition);
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .toast.show {
      transform: translateY(0);
      opacity: 1;
    }

    /* Stepper Styling */
    .stepper-container {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      background: var(--card-bg);
      border: 1px solid var(--surface-border);
      border-radius: 12px;
      padding: 16px 24px;
      overflow-x: auto;
      gap: 10px;
    }

    .step-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      flex: 1;
      position: relative;
      min-width: 90px;
    }

    .step-item:not(:last-child)::after {
      content: '';
      position: absolute;
      top: 14px;
      left: 60%;
      right: -40%;
      height: 2px;
      background: rgba(255, 255, 255, 0.08);
      z-index: 1;
      transition: var(--transition);
    }

    .step-item.step-success:not(:last-child)::after {
      background: var(--success);
    }

    .step-icon {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.05);
      border: 2px solid rgba(255, 255, 255, 0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: bold;
      color: var(--text-muted);
      z-index: 2;
      transition: var(--transition);
    }

    .step-item.step-active .step-icon {
      background: rgba(255, 109, 90, 0.1);
      border-color: var(--primary-color);
      color: var(--primary-color);
      box-shadow: 0 0 10px var(--primary-glow);
      animation: pulseGlow 1.5s infinite ease-in-out;
    }

    .step-item.step-success .step-icon {
      background: var(--success);
      border-color: var(--success);
      color: #000;
    }

    .step-name {
      font-size: 11px;
      font-weight: 500;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      transition: var(--transition);
    }

    .step-item.step-active .step-name { color: var(--primary-color); font-weight: 600; }
    .step-item.step-success .step-name { color: var(--text-main); }

    @keyframes pulseGlow {
      0% { box-shadow: 0 0 5px var(--primary-glow); }
      50% { box-shadow: 0 0 15px var(--primary-glow); }
      100% { box-shadow: 0 0 5px var(--primary-glow); }
    }

    /* Live Stock Progress Grid */
    .live-stocks-title {
      font-size: 13px;
      text-transform: uppercase;
      color: var(--text-muted);
      letter-spacing: 0.8px;
      margin-bottom: 12px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .live-stocks-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .live-stock-card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--surface-border);
      border-radius: 12px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      transition: var(--transition);
      position: relative;
      overflow: hidden;
      text-align: left;
    }

    .live-stock-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 4px;
      height: 100%;
      background: rgba(255, 255, 255, 0.1);
    }

    .live-stock-card.status-processing {
      border-color: var(--primary-color);
      background: rgba(255, 109, 90, 0.02);
      animation: pulseBorder 1.5s infinite ease-in-out;
    }
    .live-stock-card.status-processing::before { background: var(--primary-color); }

    .live-stock-card.status-success {
      border-color: var(--success);
      background: rgba(20, 80, 40, 0.05);
    }
    .live-stock-card.status-success::before { background: var(--success); }

    .live-stock-card.status-failed {
      border-color: var(--danger);
      background: rgba(80, 20, 20, 0.05);
    }
    .live-stock-card.status-failed::before { background: var(--danger); }

    .live-stock-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      padding-bottom: 6px;
      margin-bottom: 4px;
    }

    .live-stock-ticker { font-size: 15px; font-weight: 700; color: var(--text-main); }
    .live-stock-badge {
      font-size: 10px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .badge-processing { background: rgba(255, 109, 90, 0.2); color: var(--primary-color); }
    .badge-success { background: rgba(20, 180, 80, 0.2); color: var(--success); }
    .badge-failed { background: rgba(220, 50, 50, 0.2); color: var(--danger); }

    .live-stock-body {
      font-size: 12px;
      color: var(--text-muted);
      display: flex;
      flex-direction: column;
      gap: 4px;
      line-height: 1.5;
    }

    @keyframes pulseBorder {
      0% { border-color: rgba(255, 109, 90, 0.3); }
      50% { border-color: rgba(255, 109, 90, 0.8); }
      100% { border-color: rgba(255, 109, 90, 0.3); }
    }
  </style>
</head>
<body>

  <header>
    <div class="logo-container">
      <div class="logo-badge">SI</div>
      <h1>STOCK INTELLIGENCE</h1>
    </div>
    <div class="nav-tabs">
      <button class="tab-btn active" onclick="switchTab('run')">Pipeline Run</button>
      <button class="tab-btn" onclick="switchTab('reports')">Reports Hub</button>
      <button class="tab-btn" onclick="switchTab('config')">Settings Panel</button>
    </div>
    <div>
      <span style="font-size:12px; color:var(--text-muted);">Dev Server Running</span>
    </div>
  </header>

  <main>
    <!-- TAB 1: RUN PIPELINE -->
    <section id="tab-run" class="tab-panel active">
      <div class="stats-row">
        <div class="stat-card">
          <span class="stat-label">Execution Mode</span>
          <span class="stat-value" id="mode-val">Demo Mode</span>
          <span class="stat-indicator stat-degraded" id="mode-indicator">● Sheets & Gemini Fallbacks Active</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Macro Status</span>
          <span class="stat-value" id="macro-val">Active</span>
          <span class="stat-indicator stat-ok">● Yahoo & RSS Feeds working</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Last Saved Report</span>
          <span class="stat-value" id="last-report-val">None yet</span>
          <span class="stat-indicator" id="last-report-sub" style="color:var(--text-muted);">Run to generate report</span>
        </div>
      </div>

      <!-- Live Progress Board -->
      <div id="live-progress-board" style="display:none; margin-bottom: 28px;">
        <div class="stepper-container" id="live-stepper">
          <div class="step-item step-pending" id="step-sheets">
            <span class="step-icon">1</span>
            <span class="step-name">Sheets</span>
          </div>
          <div class="step-item step-pending" id="step-macro">
            <span class="step-icon">2</span>
            <span class="step-name">Macro</span>
          </div>
          <div class="step-item step-pending" id="step-exposures">
            <span class="step-icon">3</span>
            <span class="step-name">Exposures</span>
          </div>
          <div class="step-item step-pending" id="step-stocks">
            <span class="step-icon">4</span>
            <span class="step-name">Stocks</span>
          </div>
          <div class="step-item step-pending" id="step-gemini">
            <span class="step-icon">5</span>
            <span class="step-name">Gemini</span>
          </div>
          <div class="step-item step-pending" id="step-complete">
            <span class="step-icon">6</span>
            <span class="step-name">Complete</span>
          </div>
        </div>

        <div id="live-stocks-grid-container" style="display:none; margin-top:20px;">
          <h3 class="live-stocks-title">⚡ Live Stock Pipeline Activity</h3>
          <div class="live-stocks-grid" id="live-stocks-grid"></div>
        </div>
      </div>

      <div class="grid-2">
        <!-- Control Panel -->
        <div class="glass-card">
          <div class="card-header">
            <h2 class="card-title">🚀 Core Control Center</h2>
          </div>
          <p style="color:var(--text-muted); font-size:14px; margin-bottom:20px; line-height:1.6;">
            Execute the Daily Stock Intelligence pipeline. The runner automatically performs database cleanups, fetches global macro indexes, reads the stock universe (Google Sheets or high-fidelity fallbacks), scans Google News, translates sentiment and summarises with the local T5 core, parses current Yahoo Finance tickers, generates the synthesised intelligence report, and saves it locally.
          </p>

          <div style="display:flex; flex-direction:column; gap:16px; margin-top:20px;">
            <div style="display:flex; gap:12px;">
              <button class="btn btn-primary" id="btn-run" onclick="runPipeline()">
                ⚡ Run Pipeline Now
              </button>
              <button class="btn" id="btn-clear" onclick="clearTerminal()">
                Clear Logs
              </button>
            </div>
            <div style="border-top:1px solid rgba(255,255,255,0.05); padding-top:16px;">
              <h3 style="font-size:13px; text-transform:uppercase; color:var(--text-muted); letter-spacing:0.5px; margin-bottom:8px;">Running local components:</h3>
              <ul style="font-size:13px; color:var(--text-muted); padding-left:20px; line-height:1.7;">
                <li>Yahoo Finance v8 Quote Engine (Active, zero token cost)</li>
                <li>Google News RSS Scrapers (Active, zero key requirement)</li>
                <li>T5 Summarisation core (Active via Hugging Face Gradio)</li>
                <li>SQLite Database Local Store (Active WAL mode)</li>
              </ul>
            </div>
          </div>
        </div>

        <!-- Terminal Logs -->
        <div class="glass-card">
          <div class="card-header">
            <h2 class="card-title">📟 Live Execution Terminal</h2>
            <div style="font-size:11px; font-family:monospace; color:var(--text-muted);" id="run-status">READY</div>
          </div>
          <div class="terminal-container">
            <div class="terminal-header">
              <span class="dot dot-red"></span>
              <span class="dot dot-yellow"></span>
              <span class="dot dot-green"></span>
              <span class="terminal-title">bash — node index.js --now</span>
            </div>
            <div class="terminal-body" id="terminal">
              <div class="terminal-line terminal-system">System ready. Click "Run Pipeline Now" to execute.</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- TAB 2: REPORTS HUB -->
    <section id="tab-reports" class="tab-panel">
      <div class="report-split">
        <div class="report-sidebar">
          <h3 style="font-size:12px; font-weight:600; text-transform:uppercase; color:var(--text-muted); margin-bottom:12px; letter-spacing:0.5px;">Archived Reports</h3>
          <div class="report-list" id="reports-list">
            <div style="text-align:center; color:var(--text-muted); padding:20px; font-size:13px;">No reports available.</div>
          </div>
        </div>
        <div class="report-frame-container">
          <div id="report-placeholder" style="position:absolute; top:0; left:0; width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#555; background:#f4f7f6; padding:40px; text-align:center;">
            <div style="font-size:48px; margin-bottom:10px;">📊</div>
            <h3 style="color:#2c3e50; font-size:18px; margin-bottom:8px;">No Report Loaded</h3>
            <p style="max-width:320px; font-size:13px;">Select a report from the archive list on the left to read the Stock Intelligence digest.</p>
          </div>
          <iframe id="report-iframe" class="report-frame" style="display:none;"></iframe>
        </div>
      </div>
    </section>

    <!-- TAB 3: CONFIG PANEL -->
    <section id="tab-config" class="tab-panel">
      <div class="glass-card" style="max-width:960px; margin:0 auto;">
        <div class="card-header">
          <h2 class="card-title">⚙️ Environmental Configurations</h2>
          <button class="btn btn-success" id="btn-save-config" onclick="saveConfig()">Save Environment</button>
        </div>
        <p style="color:var(--text-muted); font-size:14px; margin-bottom:20px; line-height:1.6;">
          Configure local environment settings in <code>.env</code>. These parameters directly govern Google Sheets reader keys, Gmail app credentials, Gemini AI model preferences, and execution timelines.
        </p>

        <form id="config-form">
          <div class="config-grid">
            <div>
              <h3 style="font-size:14px; font-weight:600; color:var(--primary-color); margin-bottom:16px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:6px;">Google Sheets API</h3>
              <div class="form-group">
                <label>Spreadsheet ID</label>
                <input type="text" id="cfg-SPREADSHEET_ID" placeholder="e.g. 1DnVNDKMh2odj4rjLaTD8N0rYf_BiPyvvuA9DtCFHpfI">
                <span class="form-help">Unique ID from the Google Sheet URL. Leave empty to use fallback stocks.</span>
              </div>
              <div class="form-group">
                <label>Service Account JSON Key Path</label>
                <input type="text" id="cfg-GOOGLE_SERVICE_ACCOUNT_KEY" placeholder="e.g. ./google-service-account.json">
              </div>
              <div class="form-group">
                <label>Stocks Tab Name</label>
                <input type="text" id="cfg-STOCKS_SHEET_NAME" placeholder="Stocks">
              </div>
              <div class="form-group">
                <label>Exposures Tab Name</label>
                <input type="text" id="cfg-EXPOSURES_SHEET_NAME" placeholder="exposure">
              </div>
            </div>

            <div>
              <h3 style="font-size:14px; font-weight:600; color:var(--primary-color); margin-bottom:16px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:6px;">Gemini & AI Engines</h3>
              <div class="form-group">
                <label>Gemini API Key</label>
                <input type="password" id="cfg-GEMINI_API_KEY" placeholder="AIzaSy...">
                <span class="form-help">If empty, a rules-based deterministic generator handles report building locally.</span>
              </div>
              <div class="form-group">
                <label>Gemini Model</label>
                <select id="cfg-GEMINI_MODEL">
                  <option value="gemini-2.5-flash">gemini-2.5-flash (Fast, recommended)</option>
                  <option value="gemini-2.5-pro">gemini-2.5-pro (High fidelity)</option>
                  <option value="gemini-1.5-flash">gemini-1.5-flash (Legacy)</option>
                </select>
              </div>

              <h3 style="font-size:14px; font-weight:600; color:var(--primary-color); margin-top:24px; margin-bottom:16px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:6px;">Email Settings</h3>
              <div class="form-group">
                <label>Gmail User / Sender</label>
                <input type="email" id="cfg-GMAIL_USER" placeholder="your_gmail@gmail.com">
              </div>
              <div class="form-group">
                <label>Report Recipient Email</label>
                <input type="email" id="cfg-REPORT_TO" placeholder="recipient@gmail.com">
              </div>
              
              <h3 style="font-size:14px; font-weight:600; color:var(--primary-color); margin-top:24px; margin-bottom:16px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:6px;">Google Cloud OAuth2 (Gmail)</h3>
              <div class="form-group">
                <label>OAuth2 Client ID</label>
                <input type="text" id="cfg-GOOGLE_CLIENT_ID" placeholder="your_client_id.apps.googleusercontent.com">
              </div>
              <div class="form-group">
                <label>OAuth2 Client Secret</label>
                <input type="password" id="cfg-GOOGLE_CLIENT_SECRET" placeholder="OAuth Client Secret Key">
              </div>
              <div class="form-group">
                <label>OAuth2 Refresh Token</label>
                <input type="password" id="cfg-GOOGLE_REFRESH_TOKEN" placeholder="OAuth Refresh Token">
              </div>

              <h3 style="font-size:14px; font-weight:600; color:var(--primary-color); margin-top:24px; margin-bottom:16px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:6px;">Legacy App Password Fallback</h3>
              <div class="form-group">
                <label>Gmail App Password</label>
                <input type="password" id="cfg-GMAIL_APP_PASSWORD" placeholder="xxxx xxxx xxxx xxxx">
                <span class="form-help">Used only if Google Cloud OAuth2 keys above are empty.</span>
              </div>
            </div>
          </div>
        </form>
      </div>
    </section>
  </main>

  <div class="toast" id="toast">
    <span style="font-size:20px;">✓</span>
    <span id="toast-text">Settings saved successfully!</span>
  </div>

  <script>
    // Live Stepper & Stock Cards update logic
    function resetLiveProgress() {
      document.getElementById('live-progress-board').style.display = 'block';
      document.getElementById('live-stocks-grid-container').style.display = 'none';
      document.getElementById('live-stocks-grid').innerHTML = '';
      
      const steps = ['step-sheets', 'step-macro', 'step-exposures', 'step-stocks', 'step-gemini', 'step-complete'];
      steps.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.className = 'step-item step-pending';
      });
    }

    function updateStepper(stepIndex) {
      const steps = ['step-sheets', 'step-macro', 'step-exposures', 'step-stocks', 'step-gemini', 'step-complete'];
      for (let i = 0; i < steps.length; i++) {
        const el = document.getElementById(steps[i]);
        if (!el) continue;
        if (i < stepIndex) {
          el.className = 'step-item step-success';
        } else if (i === stepIndex) {
          el.className = 'step-item step-active';
        } else {
          el.className = 'step-item step-pending';
        }
      }
    }

    function parseLogLine(text) {
      // 1. Stepper updates
      if (text.includes('Building stock universe from Google Sheets')) {
        updateStepper(0); // Sheets active
      } else if (text.includes('Fetching macro context')) {
        updateStepper(1); // Macro active
      } else if (text.includes('Fetching exposure news')) {
        updateStepper(2); // Exposures active
      } else if (text.includes('Processing stocks…')) {
        updateStepper(3); // Stocks active
        document.getElementById('live-stocks-grid-container').style.display = 'block';
      } else if (text.includes('Building Gemini prompt')) {
        updateStepper(4); // Gemini active
      } else if (text.includes('Run complete at') || text.includes('SUCCESS')) {
        updateStepper(5); // Complete active
      }

      // 2. Stock parsing
      if (text.includes('[Stock] Processing')) {
        const match = text.match(/\[Stock\] Processing ([\w.-]+)/);
        if (match) {
          const ticker = match[1];
          createOrUpdateLiveStockCard(ticker, 'processing');
        }
      }
      
      if (text.includes('✓') && text.includes('articles')) {
        const match = text.match(/✓ ([\w.-]+) — (\d+) articles, price ₹([\d.]+) \(([^)]+)\)/);
        if (match) {
          const ticker = match[1];
          const articles = match[2];
          const price = match[3];
          const status = match[4];
          createOrUpdateLiveStockCard(ticker, 'success', { articles, price, status });
        }
      }

      if (text.includes('✗') && text.includes('failed:')) {
        const match = text.match(/✗ ([\w.-]+) failed: (.*)/);
        if (match) {
          const ticker = match[1];
          const error = match[2];
          createOrUpdateLiveStockCard(ticker, 'failed', { error });
        }
      }
    }

    function createOrUpdateLiveStockCard(ticker, status, details = {}) {
      const grid = document.getElementById('live-stocks-grid');
      let card = document.getElementById('live-card-' + ticker);
      
      if (!card) {
        card = document.createElement('div');
        card.id = 'live-card-' + ticker;
        grid.appendChild(card);
      }

      card.className = 'live-stock-card status-' + status;
      
      let badgeHtml = '';
      let bodyHtml = '';

      if (status === 'processing') {
        badgeHtml = '<span class="live-stock-badge badge-processing">Processing</span>';
        bodyHtml = '<div>• Fetching Google News RSS...</div>' +
                   '<div>• Polling T5 summarisation model...</div>' +
                   '<div>• Querying Yahoo Finance charts...</div>';
      } else if (status === 'success') {
        badgeHtml = '<span class="live-stock-badge badge-success">✓ Complete</span>';
        bodyHtml = '<div><strong>Latest Price:</strong> ₹' + details.price + '</div>' +
                   '<div><strong>Articles Found:</strong> ' + details.articles + ' news items</div>' +
                   '<div style="color:var(--success); font-weight:500;">Price Status: ' + details.status + '</div>';
      } else if (status === 'failed') {
        badgeHtml = '<span class="live-stock-badge badge-failed">✗ Failed</span>';
        bodyHtml = '<div style="color:var(--danger); font-weight:500; font-family:monospace;">' + details.error + '</div>';
      }

      card.innerHTML = '<div class="live-stock-header">' +
                       '  <span class="live-stock-ticker">' + ticker + '</span>' +
                       badgeHtml +
                       '</div>' +
                       '<div class="live-stock-body">' +
                       bodyHtml +
                       '</div>';
    }

    function switchTab(tabId) {
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
      
      const activeBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.textContent.toLowerCase().includes(tabId === 'run' ? 'run' : tabId === 'reports' ? 'report' : 'settings'));
      if (activeBtn) activeBtn.classList.add('active');
      
      const panel = document.getElementById('tab-' + tabId);
      if (panel) panel.classList.add('active');

      if (tabId === 'reports') {
        loadReports();
      } else if (tabId === 'config') {
        loadConfig();
      }
    }

    function clearTerminal() {
      document.getElementById('terminal').innerHTML = '<div class="terminal-line terminal-system">Terminal cleared.</div>';
    }

    function showToast(text, type='success') {
      const toast = document.getElementById('toast');
      const toastText = document.getElementById('toast-text');
      toastText.textContent = text;
      toast.style.borderColor = type === 'success' ? 'var(--success)' : 'var(--danger)';
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3000);
    }

    // Live execution log stream
    function runPipeline() {
      const runBtn = document.getElementById('btn-run');
      const term = document.getElementById('terminal');
      const runStatus = document.getElementById('run-status');
      
      runBtn.disabled = true;
      runBtn.innerHTML = '⚙️ Executing Pipeline...';
      runStatus.textContent = 'RUNNING';
      runStatus.style.color = 'var(--warning)';

      term.innerHTML += '<div class="terminal-line terminal-system">\\n[System] Spawning node index.js --now in background...</div>';
      term.scrollTop = term.scrollHeight;

      // Reset visual progress boards
      resetLiveProgress();

      const eventSource = new EventSource('/api/run-stream');

      eventSource.onmessage = function(event) {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'stdout') {
            const line = document.createElement('div');
            line.className = 'terminal-line';
            line.textContent = data.text;
            term.appendChild(line);
            
            // Pass to the visual progress parser
            parseLogLine(data.text);
          } else if (data.type === 'stderr') {
            const line = document.createElement('div');
            line.className = 'terminal-line terminal-err';
            line.textContent = '  ✗ ' + data.text;
            term.appendChild(line);
          } else if (data.type === 'close') {
            eventSource.close();
            runBtn.disabled = false;
            runBtn.innerHTML = '⚡ Run Pipeline Now';
            runStatus.textContent = data.code === 0 ? 'SUCCESS' : 'FAILED';
            runStatus.style.color = data.code === 0 ? 'var(--success)' : 'var(--danger)';
            
            const summaryLine = document.createElement('div');
            summaryLine.className = 'terminal-line terminal-system';
            summaryLine.textContent = "\n[System] Process exited with code " + data.code + ".";
            term.appendChild(summaryLine);
            term.scrollTop = term.scrollHeight;

            showToast(data.code === 0 ? 'Pipeline run complete!' : 'Pipeline run failed.', data.code === 0 ? 'success' : 'danger');
            
            // Update quick indicators
            updateIndicators();
          }
          term.scrollTop = term.scrollHeight;
        } catch (e) {
          console.error(e);
        }
      };

      eventSource.onerror = function() {
        eventSource.close();
        runBtn.disabled = false;
        runBtn.innerHTML = '⚡ Run Pipeline Now';
        runStatus.textContent = 'ERROR';
        runStatus.style.color = 'var(--danger)';
        term.innerHTML += '<div class="terminal-line terminal-err">\\n[System] Server-Sent Events connection failed.</div>';
        term.scrollTop = term.scrollHeight;
      };
    }

    function loadReports() {
      fetch('/api/reports')
        .then(res => res.json())
        .then(reports => {
          const list = document.getElementById('reports-list');
          list.innerHTML = '';
          
          if (reports.length === 0) {
            list.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:20px; font-size:13px;">No reports available.</div>';
            return;
          }

          reports.forEach(r => {
            const item = document.createElement('div');
            item.className = 'report-item';
            item.onclick = () => selectReport(r.filename, item);
            
            const dateSpan = document.createElement('span');
            dateSpan.className = 'report-date';
            dateSpan.textContent = r.date;
            
            const metaSpan = document.createElement('span');
            metaSpan.className = 'report-meta';
            metaSpan.textContent = 'HTML Document · ' + r.filename;
            
            item.appendChild(dateSpan);
            item.appendChild(metaSpan);
            list.appendChild(item);
          });
        })
        .catch(err => console.error('Error loading reports:', err));
    }

    function selectReport(filename, element) {
      document.querySelectorAll('.report-item').forEach(item => item.classList.remove('active'));
      if (element) element.classList.add('active');
      
      const iframe = document.getElementById('report-iframe');
      const placeholder = document.getElementById('report-placeholder');
      
      iframe.src = '/api/reports/' + filename;
      iframe.style.display = 'block';
      placeholder.style.display = 'none';
    }

    function loadConfig() {
      fetch('/api/config')
        .then(res => res.json())
        .then(config => {
          Object.entries(config).forEach(([key, val]) => {
            const el = document.getElementById('cfg-' + key);
            if (el) el.value = val;
          });
        })
        .catch(err => console.error('Error loading config:', err));
    }

    function saveConfig() {
      const config = {};
      const inputs = document.querySelectorAll('#config-form input, #config-form select');
      inputs.forEach(input => {
        const key = input.id.replace('cfg-', '');
        config[key] = input.value;
      });

      fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          showToast('Configuration settings saved successfully!');
          updateIndicators();
        } else {
          showToast('Failed to save settings.', 'danger');
        }
      })
      .catch(err => {
        console.error('Error saving config:', err);
        showToast('Error communicating with dev server.', 'danger');
      });
    }

    function updateIndicators() {
      fetch('/api/config')
        .then(res => res.json())
        .then(config => {
          const modeVal = document.getElementById('mode-val');
          const modeInd = document.getElementById('mode-indicator');
          
          const hasGemini = config.GEMINI_API_KEY && config.GEMINI_API_KEY !== 'your_gemini_api_key_here';
          const hasSheets = config.SPREADSHEET_ID && config.SPREADSHEET_ID !== '1DnVNDKMh2odj4rjLaTD8N0rYf_BiPyvvuA9DtCFHpfI';
          
          if (hasGemini && hasSheets) {
            modeVal.textContent = 'Live Core Mode';
            modeInd.textContent = '● Service Accounts & Gemini Live';
            modeInd.className = 'stat-indicator stat-ok';
          } else {
            modeVal.textContent = 'Demo Mode';
            modeInd.textContent = '● Sheets & Gemini Fallbacks Active';
            modeInd.className = 'stat-indicator stat-degraded';
          }
        });

      fetch('/api/reports')
        .then(res => res.json())
        .then(reports => {
          const lastReportVal = document.getElementById('last-report-val');
          const lastReportSub = document.getElementById('last-report-sub');
          
          if (reports.length > 0) {
            lastReportVal.textContent = reports[0].date;
            lastReportSub.textContent = reports[0].filename;
            lastReportSub.style.color = 'var(--success)';
          }
        });
    }

    // Initial indicators check
    updateIndicators();
  </script>
</body>
</html>`;

// ──────────────────────────────────────────────
// Dev Server Routes
// ──────────────────────────────────────────────
const server = http.createServer((req, res) => {
  console.log(`[HTTP] ${req.method} ${req.url}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Route: /
  if (req.url === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(HTML_CONTENT);
    return;
  }

  // Route: GET /api/reports
  if (req.url === '/api/reports' && req.method === 'GET') {
    fs.readdir(REPORTS_DIR, (err, files) => {
      if (err) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([]));
        return;
      }
      const reports = files
        .filter(f => f.startsWith('report_') && f.endsWith('.html'))
        .map(f => {
          const date = f.replace('report_', '').replace('.html', '');
          return { filename: f, date };
        })
        .sort((a, b) => b.date.localeCompare(a.date));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(reports));
    });
    return;
  }

  // Route: GET /api/reports/:filename
  if (req.url.startsWith('/api/reports/') && req.method === 'GET') {
    const filename = req.url.replace('/api/reports/', '');
    const filePath = path.join(REPORTS_DIR, filename);

    // Security check: ensure path is within REPORTS_DIR
    if (!filePath.startsWith(REPORTS_DIR)) {
      res.writeHead(403);
      res.end('Access denied');
      return;
    }

    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
    return;
  }

  // Route: GET /api/cron-trigger (Triggered by cron-job.org schedule to wake up and run)
  if (req.url === '/api/cron-trigger' && req.method === 'GET') {
    console.log('[Cron-Trigger] Received external trigger request. Spawning pipeline run...');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Pipeline trigger initiated successfully' }));

    const isWindows = process.platform === 'win32';
    const command = isWindows ? 'node.exe' : 'node';
    const child = spawn(command, ['index.js', '--now'], { stdio: 'inherit', cwd: process.cwd() });
    return;
  }

  // Route: GET /api/config
  if (req.url === '/api/config' && req.method === 'GET') {
    fs.readFile(ENV_PATH, 'utf8', (err, data) => {
      if (err) {
        // If no env file, try example, or return empty
        fs.readFile(ENV_EXAMPLE_PATH, 'utf8', (err2, data2) => {
          const exampleConfig = parseEnv(data2 || '');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(exampleConfig));
        });
        return;
      }
      const config = parseEnv(data);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(config));
    });
    return;
  }

  // Route: POST /api/config
  if (req.url === '/api/config' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const newConfig = JSON.parse(body);
        let envContent = `# Auto-generated Environment Configuration\n# Created at ${new Date().toISOString()}\n\n`;

        Object.entries(newConfig).forEach(([key, val]) => {
          if (key) {
            envContent += `${key}=${val}\n`;
          }
        });

        fs.writeFileSync(ENV_PATH, envContent, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Route: GET /api/run-stream (Server-Sent Events)
  if (req.url === '/api/run-stream' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const isWindows = process.platform === 'win32';
    const command = isWindows ? 'node.exe' : 'node';

    // Spawn core script index.js with --now parameter
    const child = spawn(command, ['index.js', '--now'], { cwd: process.cwd() });

    child.stdout.on('data', data => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          res.write(`data: ${JSON.stringify({ type: 'stdout', text: line })}\n\n`);
        }
      });
    });

    child.stderr.on('data', data => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          res.write(`data: ${JSON.stringify({ type: 'stderr', text: line })}\n\n`);
        }
      });
    });

    child.on('close', code => {
      res.write(`data: ${JSON.stringify({ type: 'close', code })}\n\n`);
      res.end();
    });

    return;
  }

  // Not Found fallback
  res.writeHead(404);
  res.end('Not found');
});

// ──────────────────────────────────────────────
// Helper: Simple env file parser
// ──────────────────────────────────────────────
function parseEnv(envText) {
  const config = {};
  if (!envText) return config;
  envText.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.substring(0, idx).trim();
      const val = trimmed.substring(idx + 1).trim();
      config[key] = val;
    }
  });
  return config;
}

// ──────────────────────────────────────────────
// Launch Dev Server
// ──────────────────────────────────────────────
server.listen(PORT, () => {
  console.log('═'.repeat(60));
  console.log(` Daily Stock Intelligence Dashboard`);
  console.log(` Control Center Server Live at http://localhost:${PORT}`);
  console.log(` Press Ctrl+C to shut down`);
  console.log('═'.repeat(60));
});
