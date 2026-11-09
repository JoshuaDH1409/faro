// Estado de suscripciones Pro, alimentado por el webhook de Stripe.
// Sin base de datos todo es no-op y el estado se reporta como desconocido.

const db = require('../config/db');

const PRO_STATUSES = ['active', 'trialing'];
let tableReady = false;

async function ensureSubscriptionsTable() {
  if (tableReady) return;
  await db.query(`CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY,
    email VARCHAR(200),
    stripe_customer_id VARCHAR(120),
    subscription_id VARCHAR(120) UNIQUE NOT NULL,
    status VARCHAR(40),
    current_period_end TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.query('CREATE INDEX IF NOT EXISTS subscriptions_email_idx ON subscriptions (lower(email))');
  await db.query('CREATE INDEX IF NOT EXISTS subscriptions_customer_idx ON subscriptions (stripe_customer_id)');
  tableReady = true;
}

function toDate(unixSeconds) {
  return unixSeconds ? new Date(unixSeconds * 1000) : null;
}

function normalizeEmail(email) {
  return email ? String(email).trim().toLowerCase() : null;
}

// checkout.session.completed: es el único evento que trae el correo del cliente.
async function recordCheckout({ email, customerId, subscriptionId, paid }) {
  if (!db.hasDatabase() || !subscriptionId) return false;
  await ensureSubscriptionsTable();
  const mail = normalizeEmail(email);
  await db.query(
    `INSERT INTO subscriptions (email, stripe_customer_id, subscription_id, status, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (subscription_id) DO UPDATE SET
       email = COALESCE(EXCLUDED.email, subscriptions.email),
       stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, subscriptions.stripe_customer_id),
       status = COALESCE(subscriptions.status, EXCLUDED.status),
       updated_at = NOW()`,
    [mail, customerId || null, subscriptionId, paid ? 'active' : 'incomplete']
  );
  if (mail && customerId) {
    await db.query(
      'UPDATE subscriptions SET email = $1 WHERE stripe_customer_id = $2 AND email IS NULL',
      [mail, customerId]
    );
  }
  return true;
}

// customer.subscription.created / updated / deleted
async function recordSubscription(sub) {
  if (!db.hasDatabase() || !sub || !sub.id) return false;
  await ensureSubscriptionsTable();
  const item = sub.items && sub.items.data && sub.items.data[0];
  const periodEnd = sub.current_period_end || (item && item.current_period_end) || null;
  const customerId = typeof sub.customer === 'string' ? sub.customer : (sub.customer && sub.customer.id) || null;
  await db.query(
    `INSERT INTO subscriptions (email, stripe_customer_id, subscription_id, status, current_period_end, updated_at)
     VALUES ((SELECT email FROM subscriptions WHERE stripe_customer_id = $1 AND email IS NOT NULL ORDER BY updated_at DESC LIMIT 1),
             $1, $2, $3, $4, NOW())
     ON CONFLICT (subscription_id) DO UPDATE SET
       stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, subscriptions.stripe_customer_id),
       email = COALESCE(subscriptions.email, EXCLUDED.email),
       status = EXCLUDED.status,
       current_period_end = COALESCE(EXCLUDED.current_period_end, subscriptions.current_period_end),
       updated_at = NOW()`,
    [customerId, sub.id, sub.status || null, toDate(periodEnd)]
  );
  return true;
}

// invoice.payment_failed: marca la suscripción como past_due y completa el correo si falta.
async function recordPaymentFailed(invoice) {
  if (!db.hasDatabase() || !invoice) return false;
  const subscriptionId = invoice.subscription ||
    (invoice.parent && invoice.parent.subscription_details && invoice.parent.subscription_details.subscription) || null;
  if (!subscriptionId) return false;
  await ensureSubscriptionsTable();
  await db.query(
    `UPDATE subscriptions SET status = 'past_due',
       email = COALESCE(email, $2), updated_at = NOW()
     WHERE subscription_id = $1 AND status IN ('active', 'trialing', 'incomplete')`,
    [subscriptionId, normalizeEmail(invoice.customer_email)]
  );
  return true;
}

async function getStatusByEmail(email) {
  if (!db.hasDatabase()) return { enabled: false, pro: false, status: 'unknown' };
  await ensureSubscriptionsTable();
  const { rows } = await db.query(
    `SELECT status, current_period_end FROM subscriptions
     WHERE lower(email) = $1
     ORDER BY (status = ANY($2)) DESC, updated_at DESC
     LIMIT 1`,
    [normalizeEmail(email), PRO_STATUSES]
  );
  if (!rows.length) return { enabled: true, pro: false, status: 'none' };
  const row = rows[0];
  return {
    enabled: true,
    pro: PRO_STATUSES.includes(row.status),
    status: row.status,
    currentPeriodEnd: row.current_period_end
  };
}

module.exports = { recordCheckout, recordSubscription, recordPaymentFailed, getStatusByEmail, PRO_STATUSES };
