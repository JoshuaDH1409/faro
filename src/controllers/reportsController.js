'use strict';

const db = require('../config/db');
const { requireProEmail, emailSchema } = require('../services/access');
const reports = require('../services/reportStore');
const mailer = require('../services/mailer');

const APP_URL = (process.env.FARO_APP_URL || 'https://faro-jadh.vercel.app').replace(/\/$/, '');

function uploadUrl(token) {
  return `${APP_URL}/?upload=${encodeURIComponent(token)}`;
}

function slimSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot || null;
  const copy = { ...snapshot };
  if (Array.isArray(copy.records) && copy.records.length > 200) {
    copy.records = copy.records.slice(0, 200);
  }
  if (Array.isArray(copy._rows) && copy._rows.length > 200) {
    copy._rows = copy._rows.slice(0, 200);
  }
  return copy;
}

function publicSetup(row) {
  if (!row) return null;
  return {
    email: row.email,
    name: row.name,
    period: row.period,
    columnMapping: row.column_mapping,
    token: row.token,
    uploadUrl: uploadUrl(row.token),
    updatedAt: row.updated_at
  };
}

async function saveSetup(req, res, next) {
  try {
    const access = await requireProEmail(req.body && req.body.email);
    if (!access.ok) return res.status(access.status).json(access.body);
    if (!db.hasDatabase()) {
      return res.status(503).json({ success: false, error: 'La base de datos no está disponible.' });
    }
    const period = req.body.period === 'month' ? 'month' : 'week';
    const name = String((req.body && req.body.name) || 'Reporte semanal').slice(0, 160);
    const columnMapping = req.body.columnMapping && typeof req.body.columnMapping === 'object'
      ? req.body.columnMapping
      : null;
    const row = await reports.upsertSetup({
      email: access.email,
      name,
      period,
      columnMapping
    });
    return res.json({
      success: true,
      setup: publicSetup(row),
      mailConfigured: mailer.isConfigured()
    });
  } catch (err) {
    next(err);
  }
}

async function getSetup(req, res, next) {
  try {
    const access = await requireProEmail(req.query.email);
    if (!access.ok) return res.status(access.status).json(access.body);
    if (!db.hasDatabase()) {
      return res.status(503).json({ success: false, error: 'La base de datos no está disponible.' });
    }
    const setup = await reports.getSetupByEmail(access.email);
    const history = await reports.listHistory(access.email, 10);
    return res.json({
      success: true,
      setup: publicSetup(setup),
      history,
      mailConfigured: mailer.isConfigured()
    });
  } catch (err) {
    next(err);
  }
}

async function getByToken(req, res, next) {
  try {
    const token = String(req.params.token || '').trim();
    if (!token || token.length < 16) {
      return res.status(404).json({ success: false, error: 'Link no válido.' });
    }
    const setup = await reports.getSetupByToken(token);
    if (!setup) return res.status(404).json({ success: false, error: 'No encontramos este link de carga.' });
    return res.json({
      success: true,
      setup: {
        name: setup.name,
        period: setup.period,
        columnMapping: setup.column_mapping,
        email: setup.email
      }
    });
  } catch (err) {
    next(err);
  }
}

async function saveHistory(req, res, next) {
  try {
    const token = req.body && req.body.token ? String(req.body.token).trim() : '';
    let email = null;
    let setupId = null;

    if (token) {
      const setup = await reports.getSetupByToken(token);
      if (!setup) return res.status(404).json({ success: false, error: 'Link de carga no válido.' });
      email = setup.email;
      setupId = setup.id;
    } else {
      const access = await requireProEmail(req.body && req.body.email);
      if (!access.ok) return res.status(access.status).json(access.body);
      email = access.email;
      const setup = await reports.getSetupByEmail(email);
      setupId = setup ? setup.id : null;
    }

    if (!db.hasDatabase()) {
      return res.status(503).json({ success: false, error: 'La base de datos no está disponible.' });
    }

    const saved = await reports.addHistory({
      email,
      setupId,
      title: req.body.title ? String(req.body.title).slice(0, 255) : 'Reporte Faro',
      summary: req.body.summary || null,
      snapshot: slimSnapshot(req.body.snapshot)
    });
    return res.json({ success: true, history: saved });
  } catch (err) {
    next(err);
  }
}

function reminderHtml(setup, last) {
  const link = uploadUrl(setup.token);
  const name = setup.name || 'reporte semanal';
  const greeting = setup.email ? String(setup.email).split('@')[0] : '';
  const bullets = last && last.summary && Array.isArray(last.summary.bullets)
    ? last.summary.bullets
    : [];
  const lastBlock = bullets.length
    ? `<p style="margin:16px 0 8px;color:#334155;">Tu último resumen:</p><ul style="margin:0;padding-left:18px;color:#334155;">${bullets.map((b) => `<li style="margin-bottom:4px;">${String(b)}</li>`).join('')}</ul>`
    : '<p style="color:#334155;">Aún no hay un resumen guardado. Sube tu archivo de esta semana para generar el primero.</p>';
  return `<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="background:#0f172a;padding:20px 24px;">
          <div style="font-size:20px;font-weight:700;color:#f8fafc;letter-spacing:0.02em;">Faro</div>
          <div style="font-size:13px;color:#94a3b8;margin-top:4px;">Tu reporte, listo en minutos</div>
        </td></tr>
        <tr><td style="padding:24px;">
          <p style="margin:0 0 12px;color:#0f172a;font-size:16px;">Hola${greeting ? ` ${greeting}` : ''},</p>
          <p style="margin:0 0 16px;color:#334155;line-height:1.5;">Es momento de armar tu <strong>${name}</strong> en Faro.</p>
          <p style="margin:0 0 16px;color:#334155;line-height:1.5;">Sube el Excel o CSV de este periodo en tu link personal (no lo compartas):</p>
          <p style="margin:0 0 20px;"><a href="${link}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">Subir mi archivo</a></p>
          <p style="margin:0 0 20px;font-size:12px;color:#64748b;word-break:break-all;">O copia este enlace:<br>${link}</p>
          ${lastBlock}
        </td></tr>
        <tr><td style="padding:16px 24px;background:#f1f5f9;border-top:1px solid #e2e8f0;">
          <p style="margin:0;font-size:12px;color:#64748b;line-height:1.5;">Recibes este correo porque activaste el reporte recurrente de Faro Pro.<br>Si ya no quieres estos recordatorios, responde a este mensaje con la palabra <strong>BAJA</strong> o escribe a faro.reportes@gmail.com.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function reminderText(setup, last) {
  const link = uploadUrl(setup.token);
  const name = setup.name || 'reporte semanal';
  const bullets = last && last.summary && Array.isArray(last.summary.bullets)
    ? last.summary.bullets.map((b) => `- ${b}`).join('\n')
    : 'Aún no hay un resumen guardado.';
  return `Faro — recordatorio de reporte\n\nEs momento de armar tu ${name} en Faro.\n\nSube tu archivo aquí:\n${link}\n\nÚltimo resumen:\n${bullets}\n\nSi ya no quieres estos recordatorios, responde BAJA o escribe a faro.reportes@gmail.com.\n`;
}

function isCronRequest(req) {
  if (req.headers['x-vercel-cron'] === '1') return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.authorization || '';
  return auth === `Bearer ${secret}`;
}


async function mailCheck(req, res, next) {
  try {
    if (!isCronRequest(req)) {
      return res.status(401).json({ success: false, error: 'No autorizado.' });
    }
    const verify = await mailer.verifySmtp();
    const wantSend = String(req.query.send || '') === '1' || (req.body && req.body.send === true);
    if (!wantSend) {
      return res.json({
        success: true,
        verify,
        configured: mailer.isConfigured(),
        provider: mailer.getProvider(),
        sent: false
      });
    }
    if (!verify.ok && mailer.getProvider() === 'gmail') {
      return res.status(502).json({ success: false, error: 'SMTP verify falló', verify });
    }
    const to = 'faro.reportes@gmail.com';
    const setup = {
      email: to,
      name: 'reporte semanal',
      token: 'test-upload-token-placeholder'
    };
    const last = {
      summary: {
        bullets: [
          'Esta es una prueba de entrega del recordatorio de Faro.',
          'Si lo ves, Gmail SMTP ya está funcionando en producción.'
        ]
      }
    };
    const result = await mailer.sendEmail({
      to,
      subject: '[Prueba Faro] Tu reporte semanal está listo para armarse',
      html: reminderHtml(setup, last),
      text: reminderText(setup, last)
    });
    return res.json({
      success: Boolean(result.sent),
      verify,
      provider: result.provider || mailer.getProvider(),
      sent: Boolean(result.sent),
      reason: result.reason || null,
      to
    });
  } catch (err) {
    next(err);
  }
}

async function runCron(req, res, next) {
  try {
    if (!isCronRequest(req)) {
      return res.status(401).json({ success: false, error: 'No autorizado.' });
    }
    const dryRun = String(req.query.dryRun || '') === '1' || String(req.query.dry_run || '') === '1';
    if (!db.hasDatabase()) {
      return res.json({ success: true, sent: 0, skipped: 0, reason: 'no_database', dryRun });
    }
    if (!mailer.isConfigured() && !dryRun) {
      return res.json({ success: true, sent: 0, skipped: 0, reason: 'mail_not_configured', dryRun });
    }
    const setups = await reports.listDueSetups();
    const dailyCap = mailer.DAILY_CAP;
    const limited = setups.slice(0, dailyCap);
    let sent = 0;
    let skipped = 0;
    let capped = Math.max(0, setups.length - limited.length);
    const results = [];
    for (const setup of limited) {
      try {
        const history = await reports.listHistory(setup.email, 1);
        const last = history[0] || null;
        if (dryRun) {
          skipped += 1;
          results.push({ email: setup.email, sent: false, reason: 'dry_run' });
          continue;
        }
        const result = await mailer.sendEmail({
          to: setup.email,
          subject: `Tu ${setup.name || 'reporte semanal'} de Faro está listo para armarse`,
          html: reminderHtml(setup, last),
          text: reminderText(setup, last)
        });
        if (result.sent) {
          await reports.markReminded(setup.id);
          sent += 1;
        } else {
          skipped += 1;
        }
        results.push({ email: setup.email, sent: result.sent, reason: result.reason || null, provider: result.provider || null });
      } catch (err) {
        skipped += 1;
        console.error('[Cron] error en destinatario', setup && setup.email, err && err.message);
        results.push({ email: setup.email, sent: false, reason: 'recipient_error' });
      }
    }
    return res.json({
      success: true,
      sent,
      skipped,
      capped,
      due: setups.length,
      dailyCap,
      dryRun,
      mailConfigured: mailer.isConfigured(),
      provider: mailer.getProvider(),
      results: results.map((r) => ({ sent: r.sent, reason: r.reason }))
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  saveSetup,
  getSetup,
  getByToken,
  saveHistory,
  runCron,
  mailCheck,
  reminderHtml,
  reminderText,
  uploadUrl,
  emailSchema
};
