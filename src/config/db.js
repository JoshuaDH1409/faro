const { Pool } = require('pg');

// Use a fallback connection string for local development if not provided
const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/faro';

const pool = new Pool({
  connectionString,
  // If connecting to a remote DB like Supabase/Neon, uncomment below
  // ssl: { rejectUnauthorized: false }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
