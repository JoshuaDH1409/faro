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

  // Verificación interna: source 'prueba-interna' escribe dentro de una transacción
  // y hace ROLLBACK, así se prueba la base sin dejar filas basura.
  if (lead.source === 'prueba-interna') {
    const client = await db.getPool().connect();
    try {
      await client.query('BEGIN');
      const r = await client.query(
        'INSERT INTO leads (name, email, company, role, message, source) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [lead.name, lead.email, lead.company, lead.role || null, lead.message || null, lead.source]
      );
      await client.query('ROLLBACK');
      return { storage: 'database', id: r.rows[0] && r.rows[0].id, rolledBack: true };
    } finally {
      client.release();
    }
  }

  const { rows } = await db.query(
    'INSERT INTO leads (name, email, company, role, message, source) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [lead.name, lead.email, lead.company, lead.role || null, lead.message || null, lead.source]
  );
  return { storage: 'database', id: rows[0] && rows[0].id, rolledBack: false };
}

module.exports = { saveLead, memoryLeads };
