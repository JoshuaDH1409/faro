'use strict';

function isConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

async function sendEmail({ to, subject, html, text }) {
  if (!process.env.RESEND_API_KEY) {
    console.log('[Mailer] RESEND_API_KEY no configurada; se omite el envío a', to);
    return { sent: false, reason: 'not_configured' };
  }
  if (!to) return { sent: false, reason: 'missing_recipient' };

  const from = process.env.FARO_FROM_EMAIL || 'Faro <onboarding@resend.dev>';
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html: html || undefined,
        text: text || undefined
      })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error('[Mailer] error de Resend', resp.status, data);
      return { sent: false, reason: 'provider_error', status: resp.status };
    }
    return { sent: true, id: data.id || null };
  } catch (err) {
    console.error('[Mailer] fallo de red', err.message);
    return { sent: false, reason: 'network_error' };
  }
}

module.exports = { sendEmail, isConfigured };
