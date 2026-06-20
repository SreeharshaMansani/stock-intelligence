# 📊 Daily Stock Intelligence

A lightweight Node.js bot that runs every weekday morning, fetches live prices and news for your watchlist, generates an AI-written report via Gemini, and emails it to your inbox — all on free-tier cloud services, no credit card required.

---

## How it works

Every weekday at 7:00 AM IST, a **Cloudflare Worker** wakes up your Render server and triggers the pipeline. The pipeline runs silently in the background — fetching prices, reading news, calling Gemini — and delivers a formatted HTML report to your inbox within minutes.

```
  ┌─────────────────────┐
  │  Cloudflare Worker  │  fires at 7:00, 7:10, 7:20 AM IST (Mon–Fri)
  └──────────┬──────────┘
             │ GET /api/cron-trigger
             ▼
  ┌─────────────────────┐
  │   Render Server     │  wakes container, runs pipeline once per day
  └──────────┬──────────┘
             │
      ┌──────┴───────┐
      │              │
      ▼              ▼
  📊 Prices       📰 News          fetched from Yahoo Finance + RSS
      │              │
      └──────┬───────┘
             │
             ▼
  ┌─────────────────────┐
  │    Gemini 2.5 Flash │  synthesises everything into a report
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │   Resend API        │  emails the HTML report to your inbox
  └─────────────────────┘
```

---

## Stack

| Layer | Service | Free tier |
|---|---|---|
| Hosting | [Render](https://render.com) | 750 hrs/month |
| Scheduler | [Cloudflare Workers](https://workers.cloudflare.com) | 100k req/day |
| AI | [Google AI Studio (Gemini)](https://aistudio.google.com) | Generous free quota |
| Email | [Resend](https://resend.com) | 3,000 emails/month |
| Stock data | Yahoo Finance (unofficial) | Free |
| News | RSS feeds | Free |
| Database | SQLite (local, ephemeral) | — |

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/stock-intelligence.git
cd stock-intelligence
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env` and fill in your keys:

```env
# Google Sheets
GOOGLE_SERVICE_ACCOUNT_KEY=./google-service-account.json
SPREADSHEET_ID=your_sheet_id_here
STOCKS_SHEET_NAME=Stocks
EXPOSURES_SHEET_NAME=exposure

# Gemini
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash

# Email (Resend)
RESEND_API_KEY=re_your_key_here
REPORT_TO=you@example.com

# Database
DB_PATH=./data/stock_reports.db

# Schedule (local mode only)
CRON_SCHEDULE=30 1 * * 1-5
TIMEZONE=Asia/Kolkata
```

### 3. Add your Google service account

Download a JSON key from [Google Cloud Console](https://console.cloud.google.com) → IAM → Service Accounts → Keys, rename it `google-service-account.json`, and place it in the project root. Share your Google Sheet with the service account's email address as a Viewer.

### 4. Configure your watchlist

In your Google Sheet, set up two tabs:

- **Stocks** — one stock per row: ticker, company name, exchange
- **exposure** — sector/theme keywords used to pull relevant news (e.g. `EV`, `pharma`, `IT exports`)

---

## Running locally

```bash
# Dry run — skips email, saves report to ./reports/
node index.js --now --dry-run

# Full run — fetches live data and sends the report email
node index.js --now

# Start the dashboard server (cron-trigger endpoint + control UI)
npm run dashboard
# → http://localhost:3000
```

---

## Deploying to Render

1. Push your code to a **private** GitHub repository.
2. Go to [Render](https://render.com) → New Web Service → connect your repo.
3. Set the start command to `npm run dashboard`.
4. Add all `.env` values under **Environment Variables**.
5. Under **Secret Files**, add `google-service-account.json` with your key file contents.
6. Deploy. Render gives you a URL like `https://your-app.onrender.com`.

> ⚠️ Render's free tier uses an ephemeral filesystem. The SQLite database and saved reports reset on each container restart. Your daily email reports are unaffected.

---

## Deploying the Cloudflare Worker

1. Create a free [Cloudflare](https://cloudflare.com) account.
2. Go to Workers & Pages → Create Worker.
3. Paste in `cloudflare-worker/worker.js` and update `RENDER_URL` to your Render app URL.
4. Deploy, then add three cron triggers under Settings → Triggers:

| Cron | Time (IST) |
|---|---|
| `30 1 * * 1-5` | 7:00 AM |
| `40 1 * * 1-5` | 7:10 AM |
| `50 1 * * 1-5` | 7:20 AM |

The three staggered triggers are a retry mechanism — if Render is slow to wake, the next ping catches it.

---

## Pipeline phases

| Phase | What happens |
|---|---|
| 1 | Delete database rows older than 3 days |
| 2 | Read stock universe from Google Sheets |
| 3 | Fetch macro market prices + news in parallel |
| 4 | Fetch sector/theme exposure news |
| 5 | Per-stock: live price + recent news + sentiment score |
| 6 | Read recent rows (1 day; 3 days on Mondays) |
| 7 | Build Gemini prompt → generate AI report |
| 8 | Render HTML → save locally → send email |

If the pipeline crashes at any phase, it automatically sends a diagnostic failure email with the error and stack trace.
