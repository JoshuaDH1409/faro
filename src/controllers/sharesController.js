'use strict';

const db = require('../config/db');
const { requireProEmail } = require('../services/access');
const shares = require('../services/shareStore');

const APP_URL = (process.env.FARO_APP_URL || 'https://faro-jadh.vercel.app').replace(/\/$/, '');

function slimSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const copy = { ...snapshot };
  if (Array.isArray(copy.records) && copy.records.length > 200) copy.records = copy.records.slice(0, 200);
  if (Array.isArray(copy._rows) && copy._rows.length > 200) copy._rows = copy._rows.slice(0, 200);
  return copy;
}

async function createShare(req, res, next) {
  try {
    const access = await requireProEmail(req.body && req.body.email);
    if (!access.ok) return res.status(access.status).json(access.body);
    if (!db.hasDatabase()) {
      return res.status(503).json({ success: false, error: 'La base de datos no está disponible.' });
    }
    const snapshot = slimSnapshot(req.body.snapshot);
    if (!snapshot) {
      return res.status(400).json({ success: false, error: 'No hay un informe para compartir.' });
    }
    const created = await shares.createShare({
      email: access.email,
      snapshot,
      expiresInDays: req.body.expiresInDays
    });
    return res.json({
      success: true,
      id: created.id,
      url: `${APP_URL}/?share=${created.id}`,
      expiresAt: created.expiresAt
    });
  } catch (err) {
    next(err);
  }
}

async function getShare(req, res, next) {
  try {
    const id = String(req.params.id || '').trim();
    if (!/^[a-f0-9]{32}$/i.test(id)) {
      return res.status(404).json({ success: false, error: 'Link no válido.' });
    }
    const row = await shares.getShare(id);
    if (!row) return res.status(404).json({ success: false, error: 'Este informe no existe o ya no está disponible.' });
    if (row.expired) return res.status(410).json({ success: false, error: 'Este link de informe ya expiró.' });
    return res.json({
      success: true,
      snapshot: row.snapshot,
      createdAt: row.created_at,
      expiresAt: row.expires_at
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { createShare, getShare };
