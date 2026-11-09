// Almacenamiento de leads.
// - Con DATABASE_URL o POSTGRES_URL: inserta en la tabla `leads` (se crea si no existe).
// - Sin base de datos: guarda en memoria y escribe el lead en el log del servidor.
//   En Vercel la memoria no persiste entre invocaciones; el log es el respaldo.

const db = require('../config/db');

const memoryLeads = [];
let tableReady = false;

async function ensureLeadsTable() {
  if (tableReady) return;
  await db.query(`CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(200) NOT NULL,
    company VARCHAR(160) NOT NULL,
    role VARCHAR(120),
    message TEXT,
    source VARCHAR(60),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  )`);
  tableReady = true;
}

async function saveLead(lead) {
  console.log('[Lead]', JSON.stringify(lead));

  if (!db.hasDatabase()) {
    memoryLeads.push(lead);
    if (memoryLeads.length > 500) memoryLeads.shift();
    return 'memory';
  }

  await ensureLeadsTable();
  const { rows } = await db.query(
    'INSERT INTO leads (name, email, company, role, message, source) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [lead.name, lead.email, lead.company, lead.role || null, lead.message || null, lead.source]
  );
  return { storage: 'database', id: rows[0] && rows[0].id };
}

module.exports = { saveLead, memoryLeads };
