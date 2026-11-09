// Webhook de Stripe. Queda desactivado hasta configurar
// STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET en el entorno.

let stripeClient = null;

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) return null;
  if (!stripeClient) {
    const Stripe = require('stripe');
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}

function stripeWebhook(req, res) {
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
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const s = event.data.object;
      console.log('[Billing] checkout completado', JSON.stringify({
        session: s.id,
        customer: s.customer,
        email: s.customer_details && s.customer_details.email,
        subscription: s.subscription,
        amount_total: s.amount_total,
        currency: s.currency
      }));
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      console.log('[Billing] suscripción cancelada', JSON.stringify({ subscription: sub.id, customer: sub.customer }));
      break;
    }
    default:
      console.log('[Billing] evento ignorado', event.type);
  }

  return res.json({ received: true });
}

module.exports = { stripeWebhook };
