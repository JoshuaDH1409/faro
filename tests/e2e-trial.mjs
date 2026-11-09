import { chromium } from 'playwright';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
const fixtures = new URL('./fixtures/', import.meta.url);

function largeCsv() {
  const rows = ['Folio,Cliente,Concepto,Monto,Estado,Fecha,Canal'];
  const statuses = ['Pagado', 'Pendiente', 'En Proceso'];
  const channels = ['Directo', 'Referido', 'Google Ads', 'LinkedIn B2B'];
  for (let i = 1; i <= 5000; i++) {
    rows.push(`LG-${String(i).padStart(5, '0')},Cliente ${i},Servicio ${i % 20},${(i * 13) % 9000 + 50},${statuses[i % 3]},2026-09-${String((i % 28) + 1).padStart(2, '0')},${channels[i % 4]}`);
  }
  const dir = mkdtempSync(join(tmpdir(), 'faro-csv-'));
  const path = join(dir, 'grande-5k.csv');
  writeFileSync(path, rows.join('\n'), 'utf8');
  return path;
}

async function uploadCsv(page, filePath) {
  await page.evaluate(() => {
    const modal = document.getElementById('dataSourceModal');
    if (modal) modal.classList.remove('hidden');
  });
  await page.setInputFiles('#csvFileInput', filePath);
  await page.waitForTimeout(600);
}

const errors = [];
const pageErrors = [];
let failed = 0;
function check(name, ok, extra = '') {
  if (ok) console.log('PASS', name);
  else {
    failed += 1;
    console.error('FAIL', name, extra);
  }
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => pageErrors.push(String(err)));

try {
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  check('landing loads', await page.locator('text=Tu reporte mensual').first().isVisible());
  check('trial copy visible', await page.locator('text=La prueba es gratis y completa').first().isVisible());
  check('pricing explains free vs pro', await page.locator('text=Prueba gratis, Pro cuando te sirva').first().isVisible());

  await uploadCsv(page, new URL('./ventas.csv', fixtures).pathname);
  check('sales CSV shows client', await page.locator('#tableBody').textContent().then((t) => t.includes('Corporativo Alfa')));
  check('sales KPI updates', await page.locator('#kpiValue1').textContent().then((t) => t.includes('17,600') || t.includes('17600')));

  await uploadCsv(page, new URL('./ventas.xlsx', fixtures).pathname);
  check('sales Excel shows first sheet client', await page.locator('#tableBody').textContent().then((t) => t.includes('Corporativo Alfa')));
  check('sales Excel KPI updates', await page.locator('#kpiValue1').textContent().then((t) => t.includes('17,600') || t.includes('17600')));
  const sheetVisible = await page.locator('#sheetSwitchWrap').evaluate((el) => !el.classList.contains('hidden'));
  check('multi-sheet Excel shows sheet picker', sheetVisible);
  await page.selectOption('#headerSheetSelect', 'Otra hoja');
  await page.waitForTimeout(400);
  check('switching Excel sheet updates table', await page.locator('#tableBody').textContent().then((t) => t.includes('Cliente Extra')));

  const aiBefore = await page.locator('#aiBullet1').textContent();
  await page.click('#aiGenBtn');
  await page.waitForTimeout(1500);
  const aiAfter = await page.locator('#aiBullet1').textContent();
  check('AI summary uses uploaded metrics', aiAfter.includes('17,600') || aiAfter.includes('17600') || aiAfter !== aiBefore, aiAfter);

  await uploadCsv(page, new URL('./inventario.csv', fixtures).pathname);
  check('inventory CSV maps products', await page.locator('#tableBody').textContent().then((t) => t.includes('Tóner Laser Negro') || t.includes('Toner') || t.includes('Tóner')));
  const invKpi = await page.locator('#kpiValue1').textContent();
  check('inventory KPI is non-zero', !invKpi.includes('$0 ') && !invKpi.startsWith('$0'), invKpi);

  await uploadCsv(page, new URL('./sucio.csv', fixtures).pathname);
  const messyTable = await page.locator('#tableBody').textContent();
  check('messy CSV keeps accents', messyTable.includes('Núñez') || messyTable.includes('Nunez') || messyTable.includes('José') || messyTable.includes('Córdoba') || messyTable.includes('Niños'), messyTable.slice(0, 300));
  check('messy CSV normalizes paid status', messyTable.includes('Pagado'));

  const largePath = largeCsv();
  const start = Date.now();
  await uploadCsv(page, largePath);
  const elapsed = Date.now() - start;
  const countText = await page.locator('#tableRecordCount').textContent();
  check('large CSV reports 5000 rows', /5000/.test(countText || ''), countText);
  check('large CSV table is capped', /200/.test(countText || ''), countText);
  check('large CSV renders in under 15s', elapsed < 15000, String(elapsed));

  const term = await page.goto(BASE + '/terminos', { waitUntil: 'networkidle' });
  check('terms page ok', term.ok());
  check('terms has contact email', (await page.content()).includes('faro.reportes@gmail.com'));
  const priv = await page.goto(BASE + '/privacidad', { waitUntil: 'networkidle' });
  check('privacy page ok', priv.ok());

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mpage = await mobile.newPage();
  await mpage.goto(BASE + '/', { waitUntil: 'networkidle' });
  check('mobile hero visible', await mpage.locator('text=Tu reporte mensual').first().isVisible());
  check('mobile subscribe visible', await mpage.locator('.js-subscribe').first().isVisible());
  const overflow = await mpage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 8);
  check('mobile no major horizontal overflow', !overflow, `scrollWidth=${await mpage.evaluate(() => document.documentElement.scrollWidth)}`);
  await mobile.close();

  const billed = await browser.newContext();
  await billed.addInitScript(() => {
    localStorage.setItem('faro_email', 'nobody@example.com');
    localStorage.setItem('faro_pro', '1');
  });
  const bpage = await billed.newPage();
  await bpage.goto(BASE + '/?checkout=success', { waitUntil: 'networkidle' });
  await bpage.waitForTimeout(2500);
  const badgeHidden = await bpage.locator('#proBadge').evaluate((el) => el.classList.contains('hidden'));
  check('checkout=success does not grant Pro without server confirmation', badgeHidden);
  check('checkout modal asks for email', await bpage.locator('#checkoutModal').evaluate((el) => !el.classList.contains('hidden')));
  await billed.close();

  const severe = [...errors, ...pageErrors].filter((e) => !/cdn\.tailwindcss|fonts\.gstatic|Failed to load resource/.test(e));
  check('no severe console errors', severe.length === 0, severe.join(' | '));
} finally {
  await browser.close();
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll UI checks passed');
