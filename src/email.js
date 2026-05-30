'use strict';
/**
 * email.js — Nodemailer Gmail sender.
 * Replaces the "Send Email" (n8n-nodes-base.gmail) node.
 *
 * Setup: enable 2FA on your Gmail account, then generate an App Password at
 * https://myaccount.google.com/apppasswords and put it in GMAIL_APP_PASSWORD.
 */

const nodemailer = require('nodemailer');

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const hasOAuth2 = process.env.GOOGLE_CLIENT_ID && 
                    process.env.GOOGLE_CLIENT_SECRET && 
                    process.env.GOOGLE_REFRESH_TOKEN;

  if (hasOAuth2) {
    console.log('[Email] Initializing Nodemailer with Google Cloud OAuth2...');
    _transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        type: 'OAuth2',
        user: process.env.GMAIL_USER,
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
      },
      connectionTimeout: 60000,
      greetingTimeout: 30000,
      socketTimeout: 300000
    });
  } else {
    console.log('[Email] Initializing Nodemailer with standard credentials (App Password)...');
    _transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
      connectionTimeout: 60000,
      greetingTimeout: 30000,
      socketTimeout: 300000
    });
  }

  return _transporter;
}

/**
 * Send the HTML report email.
 * @param {string} html   - Full HTML body
 * @param {string} date   - Human-readable date string for subject
 */
async function sendReport(html, date) {
  const transporter = getTransporter();

  const subject = `📊 Stock Intelligence — ${date}`;

  await transporter.sendMail({
    from:    `"Stock Intelligence Bot" <${process.env.GMAIL_USER}>`,
    to:      process.env.REPORT_TO,
    subject,
    html,
  });

  console.log(`[Email] Report sent to ${process.env.REPORT_TO}`);
}

module.exports = { sendReport };
