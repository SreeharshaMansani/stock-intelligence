'use strict';
/**
 * email.js — Google APIs Gmail REST client over HTTPS.
 * Replaces the Nodemailer SMTP sender.
 * Uses standard Port 443 web calls to prevent SMTP port blocks on Render.
 */

const { google } = require('googleapis');

/**
 * Send the HTML report email using Gmail REST API.
 * @param {string} html   - Full HTML body
 * @param {string} date   - Human-readable date string for subject
 */
async function sendReport(html, date) {
  // 1. Initialize Google OAuth2 client
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oAuth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

  // 2. Build RFC 2822 compliant email message
  const subject = `📊 Stock Intelligence — ${date}`;
  const sender = `"Stock Intelligence Bot" <${process.env.GMAIL_USER}>`;
  const to = process.env.REPORT_TO;

  const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
  const messageParts = [
    `From: ${sender}`,
    `To: ${to}`,
    `Content-Type: text/html; charset=utf-8`,
    `MIME-Version: 1.0`,
    `Subject: ${utf8Subject}`,
    '',
    html
  ];
  const message = messageParts.join('\n');

  // Gmail API requires base64url encoded raw email message
  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  // 3. Dispatch call to Gmail REST API over secure HTTPS (Port 443)
  console.log('[Email] Sending email via secure Gmail HTTP REST API...');
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedMessage,
    },
  });

  console.log(`[Email] Report sent via Gmail REST API to ${to}`);
}

module.exports = { sendReport };
