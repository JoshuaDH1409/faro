'use strict';

delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.FARO_STORAGE_DATABASE_URL;
delete process.env.FARO_STORAGE_POSTGRES_URL;
delete process.env.RESEND_API_KEY;
delete process.env.CRON_SECRET;

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const app = require('../src/app');
const { requireProEmail } = require('../src/services/access');
const { sendEmail, isConfigured } = require('../src/services/mailer');

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

async function json(path, options = {}) {
  const resp = await fetch(baseUrl + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const body = await resp.json().catch(() => ({}));
  return { status: resp.status, body };
}

test('requireProEmail rejects invalid emails', async () => {
  const result = await requireProEmail('no-es-correo');
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});

test('requireProEmail does not grant Pro without a subscription record', async () => {
  const result = await requireProEmail('nobody@example.com');
  assert.equal(result.ok, false);
  assert.equal(result.body.pro, false);
});

test('mailer no-ops without RESEND_API_KEY', async () => {
  assert.equal(isConfigured(), false);
  const result = await sendEmail({ to: 'test@example.com', subject: 'x', text: 'y' });
  assert.equal(result.sent, false);
  assert.equal(result.reason, 'not_configured');
});

test('cron endpoint rejects unauthenticated requests', async () => {
  const { status, body } = await json('/api/v1/reports/cron');
  assert.equal(status, 401);
  assert.equal(body.success, false);
});

test('saving a report setup without Pro is forbidden or invalid', async () => {
  const invalid = await json('/api/v1/reports/setup', { method: 'POST', body: JSON.stringify({ email: 'bad' }) });
  assert.equal(invalid.status, 400);
  const forbidden = await json('/api/v1/reports/setup', { method: 'POST', body: JSON.stringify({ email: 'nobody@example.com' }) });
  assert.ok(forbidden.status === 403 || forbidden.status === 503);
  assert.equal(forbidden.body.pro, false);
});

test('creating a share without Pro is forbidden or invalid', async () => {
  const { status, body } = await json('/api/v1/shares', {
    method: 'POST',
    body: JSON.stringify({ email: 'nobody@example.com', snapshot: { title: 'x' } })
  });
  assert.ok(status === 403 || status === 503);
  assert.equal(body.pro, false);
});

test('unknown share ids do not leak reports', async () => {
  const bad = await json('/api/v1/shares/not-a-valid-id');
  assert.equal(bad.status, 404);
  const missing = await json('/api/v1/shares/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.ok(missing.status === 404 || missing.status === 503);
});
