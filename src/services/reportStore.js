'use strict';

const crypto = require('crypto');
const db = require('../config/db');

let tableReady = false;

function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

async function ensureTables() {
  if (tableReady || !db.hasDatabase()) return;
  await db.query(`CREATE TABLE IF NOT EXISTS report_setups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(200) NOT NULL,
    token VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(160) DEFAULT 'Reporte semanal',
    column_mapping JSONB,
    period VARCHAR(20) DEFAULT 'week',
    schedule VARCHAR(20) DEFAULT 'weekly',
    last_reminded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.query('CREATE UNIQUE INDEX IF NOT EXISTS report_setups_email_uidx ON report_setups (lower(email))');
  await db.query('CREATE INDEX IF NOT EXISTS report_setups_token_idx ON report_setups (token)');
  await db.query(`CREATE TABLE IF NOT EXISTS report_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(200) NOT NULL,
    setup_id UUID REFERENCES report_setups(id) ON DELETE SET NULL,
    title VARCHAR(255),
    summary JSONB,
    snapshot JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.query('CREATE INDEX IF NOT EXISTS report_history_email_idx ON report_history (lower(email))');
  await db.query('CREATE INDEX IF NOT EXISTS report_history_created_idx ON report_history (created_at DESC)');
  tableReady = true;
}

async function upsertSetup({ email, name, period, columnMapping }) {
  if (!db.hasDatabase()) return null;
  await ensureTables();
  const existing = await db.query(
    'SELECT id, token FROM report_setups WHERE lower(email) = $1 LIMIT 1',
    [email]
  );
  const safePeriod = period === 'month' ? 'month' : 'week';
  const safeName = name || 'Reporte semanal';
  if (existing.rows[0]) {
    const { rows } = await db.query(
      `UPDATE report_setups
       SET name = $2, column_mapping = COALESCE($3, column_mapping), period = $4, updated_at = NOW()
       WHERE lower(email) = $1
       RETURNING *`,
      [email, safeName, columnMapping || null, safePeriod]
    );
    return rows[0];
  }
  const { rows } = await db.query(
    `INSERT INTO report_setups (email, token, name, column_mapping, period, schedule, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'weekly', NOW())
     RETURNING *`,
    [email, newToken(), safeName, columnMapping || null, safePeriod]
  );
  return rows[0];
}

async function getSetupByEmail(email) {
  if (!db.hasDatabase()) return null;
  await ensureTables();
  const { rows } = await db.query(
    'SELECT * FROM report_setups WHERE lower(email) = $1 LIMIT 1',
    [email]
  );
  return rows[0] || null;
}

async function getSetupByToken(token) {
  if (!db.hasDatabase() || !token) return null;
  await ensureTables();
  const { rows } = await db.query(
    'SELECT * FROM report_setups WHERE token = $1 LIMIT 1',
    [token]
  );
  return rows[0] || null;
}

async function addHistory({ email, setupId, title, summary, snapshot }) {
  if (!db.hasDatabase()) return null;
  await ensureTables();
  const { rows } = await db.query(
    `INSERT INTO report_history (email, setup_id, title, summary, snapshot)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, setup_id, title, summary, created_at`,
    [email, setupId || null, title || 'Reporte Faro', summary || null, snapshot || null]
  );
  return rows[0];
}

async function listHistory(email, limit = 10) {
  if (!db.hasDatabase()) return [];
  await ensureTables();
  const { rows } = await db.query(
    `SELECT id, email, setup_id, title, summary, created_at
     FROM report_history
     WHERE lower(email) = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [email, Math.min(Number(limit) || 10, 25)]
  );
  return rows;
}

async function listDueSetups() {
  if (!db.hasDatabase()) return [];
  await ensureTables();
  const { rows } = await db.query(
    `SELECT * FROM report_setups
     WHERE last_reminded_at IS NULL OR last_reminded_at < NOW() - INTERVAL '6 days'`
  );
  return rows;
}

async function markReminded(id) {
  if (!db.hasDatabase()) return;
  await ensureTables();
  await db.query('UPDATE report_setups SET last_reminded_at = NOW(), updated_at = NOW() WHERE id = $1', [id]);
}

module.exports = {
  ensureTables,
  upsertSetup,
  getSetupByEmail,
  getSetupByToken,
  addHistory,
  listHistory,
  listDueSetups,
  markReminded,
  newToken
};
