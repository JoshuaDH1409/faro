'use strict';

const crypto = require('crypto');
const db = require('../config/db');

let tableReady = false;

function newShareId() {
  return crypto.randomBytes(16).toString('hex');
}

async function ensureTable() {
  if (tableReady || !db.hasDatabase()) return;
  await db.query(`CREATE TABLE IF NOT EXISTS shared_reports (
    id VARCHAR(32) PRIMARY KEY,
    email VARCHAR(200),
    snapshot JSONB NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.query('CREATE INDEX IF NOT EXISTS shared_reports_expires_idx ON shared_reports (expires_at)');
  tableReady = true;
}

async function createShare({ email, snapshot, expiresInDays }) {
  if (!db.hasDatabase()) return null;
  await ensureTable();
  const id = newShareId();
  const days = Number(expiresInDays);
  const expiresAt = Number.isFinite(days) && days > 0
    ? new Date(Date.now() + days * 86400000)
    : new Date(Date.now() + 30 * 86400000);
  await db.query(
    `INSERT INTO shared_reports (id, email, snapshot, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [id, email || null, snapshot, expiresAt]
  );
  return { id, expiresAt };
}

async function getShare(id) {
  if (!db.hasDatabase() || !id) return null;
  await ensureTable();
  const { rows } = await db.query(
    `SELECT id, email, snapshot, expires_at, created_at
     FROM shared_reports
     WHERE id = $1
     LIMIT 1`,
    [id]
  );
  const row = rows[0];
  if (!row) return null;
  if (row.expires_at && new Date(row.expires_at) < new Date()) return { expired: true };
  return row;
}

module.exports = { ensureTable, createShare, getShare, newShareId };
