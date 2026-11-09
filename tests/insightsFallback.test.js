'use strict';

delete process.env.GEMINI_API_KEY;

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateExecutiveInsights, heuristicInsights } = require('../src/services/geminiService');

test('heuristic fallback uses the provided metrics', () => {
  const bullets = heuristicInsights({
    title: 'Ventas Demo',
    income: '$12,500 USD',
    ticket: '$250 USD',
    accounts: '50 registros',
    collectionRate: '80%',
    channels: ['Directo', 'Referido']
  });
  assert.equal(bullets.length, 3);
  assert.match(bullets[0], /12,500/);
  assert.match(bullets[1], /250/);
  assert.match(bullets[2], /Directo/);
});

test('generateExecutiveInsights falls back gracefully without a Gemini key', async () => {
  const bullets = await generateExecutiveInsights({ income: 48250, margin: 68.4 });
  assert.equal(Array.isArray(bullets), true);
  assert.equal(bullets.length, 3);
  assert.match(bullets[0], /48250/);
});

test('heuristic comparison mentions the main driver and the period change', () => {
  const bullets = heuristicInsights({
    title: 'Ventas Demo',
    income: '$18,200.00',
    ticket: '$4,550.00',
    accounts: '4 registros',
    collectionRate: '100%',
    channels: ['Directo'],
    comparison: {
      previousLabel: 'el mes anterior',
      income: { current: 6200, previous: 12000, deltaAbs: -5800, deltaPct: -48.333 },
      topDrivers: [{ name: 'Cliente X', dimension: 'cliente', delta: -6000, deltaPct: -60 }]
    }
  });
  assert.equal(bullets.length, 3);
  assert.match(bullets[0], /bajaron/i);
  assert.match(bullets[0], /48\.3%/);
  assert.match(bullets[0], /Cliente X/);
  assert.match(bullets[2], /Cliente X/);
});
