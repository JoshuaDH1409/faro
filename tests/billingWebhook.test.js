'use strict';

// Secret only for local tests. Never use the live Stripe webhook secret here.
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_local_only_do_not_use_live';
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.FARO_STORAGE_DATABASE_URL;
delete process.env.FARO_STORAGE_POSTGRES_URL;

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const Stripe = require('stripe');
const app = require('../src/app');
const {
  isFaroCheckout,
  isFaroSubscription,
  handleEvent
} = require('../src/controllers/billingController');

const TEST_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const stripe = new Stripe('sk_test_webhook_verification_only');
const FARO_PRICE = 'price_1UZvzmLrDbELefxIrwDdFFPt';
const FARO_LINK = 'plink_1UZvzsLrDbELefxIuMLvhzIQ';

let server;
let baseUrl;

before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

function envelope(type, object) {
  return {
    id: `evt_test_${type.replace(/\./g, '_')}`,
    object: 'event',
    type,
    data: { object }
  };
}

function sign(payload) {
  return stripe.webhooks.generateTestHeaderString({ payload, secret: TEST_SECRET });
}

async function postWebhook(event, { tamper = false, unsigned = false, secret } = {}) {
  const payload = JSON.stringify(event);
  const body = tamper ? payload.replace('paid', 'PAID') : payload;
  const headers = { 'content-type': 'application/json' };
  if (!unsigned) {
    headers['stripe-signature'] = secret
      ? stripe.webhooks.generateTestHeaderString({ payload: body, secret })
      : sign(payload);
  }
  return fetch(`${baseUrl}/api/v1/billing/webhook`, {
    method: 'POST',
    headers,
    body
  });
}

const faroSession = {
  id: 'cs_test_faro',
  object: 'checkout.session',
  mode: 'subscription',
  payment_link: FARO_LINK,
  customer: 'cus_test',
  customer_details: { email: 'Buyer@Empresa.com' },
  customer_email: 'Buyer@Empresa.com',
  subscription: 'sub_test_faro',
  payment_status: 'paid',
  amount_total: 2900,
  currency: 'usd'
};

const faroSub = {
  id: 'sub_test_faro',
  object: 'subscription',
  customer: 'cus_test',
  status: 'active',
  current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
  items: { data: [{ price: { id: FARO_PRICE }, current_period_end: Math.floor(Date.now() / 1000) + 2592000 }] }
};

test('rejects unsigned webhook payloads', async () => {
  const res = await postWebhook(envelope('checkout.session.completed', faroSession), { unsigned: true });
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.received, false);
});

test('rejects webhook signed with the wrong secret', async () => {
  const res = await postWebhook(envelope('checkout.session.completed', faroSession), {
    secret: 'whsec_some_other_local_secret'
  });
  assert.equal(res.status, 400);
});

test('rejects tampered payload even if a signature header is present', async () => {
  const res = await postWebhook(envelope('checkout.session.completed', faroSession), { tamper: true });
  assert.equal(res.status, 400);
});

test('accepts a signed checkout.session.completed for Faro', async () => {
  const res = await postWebhook(envelope('checkout.session.completed', faroSession));
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.received, true);
  // Without a database the event is verified but not persisted.
  assert.equal(json.stored, false);
});

test('accepts checkout.session.async_payment_succeeded for Faro', async () => {
  const res = await postWebhook(envelope('checkout.session.async_payment_succeeded', faroSession));
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.received, true);
});

test('Faro-only filter ignores another product payment link', async () => {
  assert.equal(isFaroCheckout({ ...faroSession, payment_link: 'plink_other_product' }), false);
  const stored = await handleEvent(envelope('checkout.session.completed', {
    ...faroSession,
    payment_link: 'plink_other_product'
  }));
  assert.equal(stored, false);

  const res = await postWebhook(envelope('checkout.session.completed', {
    ...faroSession,
    payment_link: 'plink_other_product'
  }));
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.received, true);
  assert.equal(json.stored, false);
});

test('Faro-only filter ignores one-time (non-subscription) checkouts', () => {
  assert.equal(isFaroCheckout({ ...faroSession, mode: 'payment' }), false);
});

test('accepts subscription updated/deleted for the Faro price', async () => {
  assert.equal(isFaroSubscription(faroSub), true);
  const updated = await postWebhook(envelope('customer.subscription.updated', faroSub));
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).received, true);

  const deleted = await postWebhook(envelope('customer.subscription.deleted', {
    ...faroSub,
    status: 'canceled'
  }));
  assert.equal(deleted.status, 200);
});

test('Faro-only filter ignores a subscription for another price', async () => {
  const other = {
    ...faroSub,
    id: 'sub_other',
    items: { data: [{ price: { id: 'price_OTHER_PRODUCT' } }] }
  };
  assert.equal(isFaroSubscription(other), false);
  const stored = await handleEvent(envelope('customer.subscription.updated', other));
  assert.equal(stored, false);
});

test('accepts invoice.payment_failed', async () => {
  const res = await postWebhook(envelope('invoice.payment_failed', {
    id: 'in_test_fail',
    customer: 'cus_test',
    customer_email: 'buyer@empresa.com',
    subscription: 'sub_test_faro'
  }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).received, true);
});

test('GET /billing/status rejects invalid emails', async () => {
  const res = await fetch(`${baseUrl}/api/v1/billing/status?email=not-an-email`);
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.pro, false);
  assert.equal(json.status, 'invalid_email');
});

test('GET /billing/status is case-insensitive and does not grant Pro without a record', async () => {
  const a = await fetch(`${baseUrl}/api/v1/billing/status?email=Buyer@Empresa.com`);
  const b = await fetch(`${baseUrl}/api/v1/billing/status?email=buyer@empresa.com`);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  const ja = await a.json();
  const jb = await b.json();
  assert.equal(ja.pro, false);
  assert.equal(jb.pro, false);
  assert.equal(ja.enabled, jb.enabled);
  assert.equal(ja.status, jb.status);
});
