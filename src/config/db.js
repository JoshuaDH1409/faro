const { Pool } = require('pg');

// Neon (Vercel Marketplace) define DATABASE_URL y POSTGRES_URL. Cualquiera sirve.
function connectionString() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
}

function hasDatabase() {
  return Boolean(connectionString());
}

let pool = null;

function getPool() {
  if (!pool) {
    const cs = connectionString() || 'postgres://postgres:postgres@localhost:5432/faro';
    const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(cs);
    pool = new Pool({
      connectionString: cs,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 3
    });
  }
  return pool;
}

module.exports = {
  query: (text, params) => getPool().query(text, params),
  hasDatabase,
  getPool
};
