// Webhook de Stripe y estado de suscripción.
// Para verificar la firma solo hace falta STRIPE_WEBHOOK_SECRET; la clave secreta
// de la API es opcional (se usa un placeholder porque no se llama a la API de Stripe).

const { z } = require('zod');
const subs = require('../services/subscriptionStore');

let stripeClient = null;

// La cuenta de Stripe puede tener otros productos: solo cuentan los eventos de Faro Pro.
const FARO_PRICE_ID = process.env.STRIPE_PRICE_ID || 'price_1UZvzmLrDbELefxIrwDdFFPt';
const FARO_PAYMENT_LINK_ID = process.env.STRIPE_PAYMENT_LINK_ID || 'plink_1UZvzsLrDbELefxIuMLvhzIQ';

function isFaroCheckout(session) {
  if (session.mode && session.mode !== 'subscription') return false;
  return !session.payment_link || session.payment_link === FARO_PAYMENT_LINK_ID;
}

function isFaroSubscription(sub) {
  const items = (sub.items && sub.items.data) || [];
  if (!items.length) return true;
  return items.some(it => (it.price && it.price.id) === FARO_PRICE_ID || (it.plan && it.plan.id) === FARO_PRICE_ID);
}

function getStripe() {
  if (!process.env.STRIPE_WEBHOOK_SECRET) return null;
  if (!stripeClient) {
    const Stripe = require('stripe');
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_webhook_verification_only');
  }
  return stripeClient;
}

async function handleEvent(event) {
  const obj = event.data.object;
  switch (event.type) {
    case 'checkout.session.completed': {
      if (!isFaroCheckout(obj)) { console.log('[Billing] checkout de otro producto, ignorado'); return false; }
      const email = (obj.customer_details && obj.customer_details.email) || obj.customer_email || null;
      console.log('[Billing] checkout completado', JSON.stringify({
        session: obj.id, customer: obj.customer, subscription: obj.subscription,
        amount_total: obj.amount_total, currency: obj.currency, payment_status: obj.payment_status
      }));
      return subs.recordCheckout({
        email,
        customerId: obj.customer,
        subscriptionId: obj.subscription,
        paid: obj.payment_status === 'paid' || obj.payment_status === 'no_payment_required'
      });
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      if (!isFaroSubscription(obj)) { console.log('[Billing] suscripción de otro producto, ignorada'); return false; }
      console.log('[Billing]', event.type, JSON.stringify({ subscription: obj.id, customer: obj.customer, status: obj.status }));
      return subs.recordSubscription(obj);
    case 'invoice.payment_failed':
      console.log('[Billing] pago fallido', JSON.stringify({ invoice: obj.id, customer: obj.customer }));
      return subs.recordPaymentFailed(obj);
    default:
      console.log('[Billing] evento ignorado', event.type);
      return false;
  }
}

async function stripeWebhook(req, res) {
  const stripe = getStripe();
  if (!stripe) {
    return res.status(503).json({ success: false, enabled: false, error: 'Billing webhook no configurado.' });
  }

  const signature = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.warn('[Billing] firma inválida:', err.message);
    return res.status(400).json({ received: false, error: 'Firma inválida.' });
  }

  try {
    const stored = await handleEvent(event);
    return res.json({ received: true, stored: Boolean(stored) });
  } catch (err) {
    // 500 para que Stripe reintente el evento más tarde.
    console.error('[Billing] error al guardar evento', event.type, err.message);
    return res.status(500).json({ received: false });
  }
}

const emailSchema = z.string().trim().toLowerCase().email().max(200);

async function billingStatus(req, res) {
  const parsed = emailSchema.safeParse(req.query.email || '');
  if (!parsed.success) {
    return res.status(400).json({ pro: false, status: 'invalid_email', error: 'Correo inválido.' });
  }
  res.set('Cache-Control', 'no-store');
  try {
    const result = await subs.getStatusByEmail(parsed.data);
    return res.json(result);
  } catch (err) {
    console.error('[Billing] error al consultar estado', err.message);
    return res.json({ enabled: false, pro: false, status: 'unknown' });
  }
}

module.exports = { stripeWebhook, billingStatus };
