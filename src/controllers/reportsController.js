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
  const bullets = last && last.summary && Array.isArray(last.summary.bullets)
    ? last.summary.bullets
    : [];
  const lastBlock = bullets.length
    ? `<p>Tu último resumen:</p><ul>${bullets.map((b) => `<li>${String(b)}</li>`).join('')}</ul>`
    : '<p>Aún no hay un resumen guardado. Sube tu archivo de esta semana para generar el primero.</p>';
  return `
    <p>Hola,</p>
    <p>Es momento de armar tu ${setup.name || 'reporte semanal'} en Faro.</p>
    <p>Sube el Excel o CSV de este periodo en tu link personal (no lo compartas):</p>
    <p><a href="${link}">${link}</a></p>
    ${lastBlock}
    <p>Faro · Tu reporte, listo en minutos.</p>
  `;
}

function reminderText(setup, last) {
  const link = uploadUrl(setup.token);
  const bullets = last && last.summary && Array.isArray(last.summary.bullets)
    ? last.summary.bullets.map((b) => `- ${b}`).join('\n')
    : 'Aún no hay un resumen guardado.';
  return `Es momento de armar tu ${setup.name || 'reporte semanal'} en Faro.\n\nSube tu archivo aquí:\n${link}\n\nÚltimo resumen:\n${bullets}\n`;
}

function isCronRequest(req) {
  if (req.headers['x-vercel-cron'] === '1') return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.authorization || '';
  return auth === `Bearer ${secret}`;
}

async function runCron(req, res, next) {
  try {
    if (!isCronRequest(req)) {
      return res.status(401).json({ success: false, error: 'No autorizado.' });
    }
    if (!db.hasDatabase()) {
      return res.json({ success: true, sent: 0, skipped: 0, reason: 'no_database' });
    }
    const setups = await reports.listDueSetups();
    let sent = 0;
    let skipped = 0;
    const results = [];
    for (const setup of setups) {
      const history = await reports.listHistory(setup.email, 1);
      const last = history[0] || null;
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
      results.push({ email: setup.email, ...result });
    }
    return res.json({
      success: true,
      sent,
      skipped,
      mailConfigured: mailer.isConfigured(),
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
  emailSchema
};
