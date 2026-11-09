'use strict';

const nodemailer = require('nodemailer');

const DAILY_CAP = Number(process.env.FARO_MAIL_DAILY_CAP || 80);

let gmailTransporter = null;

function gmailConfigured() {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

function resendConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

function isConfigured() {
  return gmailConfigured() || resendConfigured();
}

function getProvider() {
  if (gmailConfigured()) return 'gmail';
  if (resendConfigured()) return 'resend';
  return null;
}

function getFrom() {
  return (
    process.env.FARO_FROM_EMAIL ||
    (gmailConfigured()
      ? `Joshua Díaz | Faro <${process.env.GMAIL_USER}>`
      : 'Faro <onboarding@resend.dev>')
  );
}

function getGmailTransporter() {
  if (!gmailConfigured()) return null;
  if (gmailTransporter) return gmailTransporter;
  const user = process.env.GMAIL_USER;
  const pass = String(process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  gmailTransporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass }
  });
  return gmailTransporter;
}

async function verifySmtp() {
  if (!gmailConfigured()) {
    return { ok: false, reason: 'gmail_not_configured' };
  }
  try {
    await getGmailTransporter().verify();
    return { ok: true, provider: 'gmail' };
  } catch (err) {
    return { ok: false, reason: 'verify_failed', message: err.message };
  }
}

async function sendViaGmail({ to, subject, html, text }) {
  const transporter = getGmailTransporter();
  const info = await transporter.sendMail({
    from: getFrom(),
    to,
    subject,
    html: html || undefined,
    text: text || undefined
  });
  return { sent: true, id: info.messageId || null, provider: 'gmail' };
}

async function sendViaResend({ to, subject, html, text }) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: getFrom(),
      to: [to],
      subject,
      html: html || undefined,
      text: text || undefined
    })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error('[Mailer] error de Resend', resp.status);
    return { sent: false, reason: 'provider_error', status: resp.status, provider: 'resend' };
  }
  return { sent: true, id: data.id || null, provider: 'resend' };
}

async function sendEmail({ to, subject, html, text }) {
  if (!to) return { sent: false, reason: 'missing_recipient' };
  const provider = getProvider();
  if (!provider) {
    console.log('[Mailer] sin proveedor configurado; se omite el envío a', to);
    return { sent: false, reason: 'not_configured' };
  }
  try {
    if (provider === 'gmail') return await sendViaGmail({ to, subject, html, text });
    return await sendViaResend({ to, subject, html, text });
  } catch (err) {
    console.error('[Mailer] fallo de envío', err && err.message ? err.message : 'unknown');
    return { sent: false, reason: 'network_error', provider };
  }
}

module.exports = {
  sendEmail,
  isConfigured,
  verifySmtp,
  getProvider,
  getFrom,
  DAILY_CAP
};
