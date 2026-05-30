'use strict';
/**
 * email.js — Resend HTTP REST client over HTTPS.
 * Replaces SMTP and Gmail REST senders.
 * Uses standard Port 443 web calls to prevent all cloud port blocks on Render.
 */

const axios = require('axios');

/**
 * Send the HTML report email using Resend API.
 * @param {string} html   - Full HTML body
 * @param {string} date   - Human-readable date string for subject
 */
async function sendReport(html, date) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_your_api_key')) {
    throw new Error('Resend API key is missing or not configured in your environment variables');
  }

  const to = process.env.REPORT_TO;
  const subject = `📊 Stock Intelligence — ${date}`;

  console.log('[Email] Sending email via Resend HTTP REST API...');

  await axios.post('https://api.resend.com/emails', {
    from: 'Stock Intelligence Bot <onboarding@resend.dev>',
    to: [to],
    subject: subject,
    html: html
  }, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    timeout: 40000
  });

  console.log(`[Email] Report sent via Resend API to ${to}`);
}

module.exports = { sendReport };
