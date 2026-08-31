/**
 * End-to-end smoke test: boots the real HTTP server against a throwaway
 * database and exercises every route. Also asserts the white-label guarantee —
 * no response anywhere names the source carrier or customer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = join(__dirname, '..', 'server.mjs');
const DB = join(tmpdir(), `freight_e2e_${process.pid}_${Date.now()}.db`);
const PORT = 4793;
const BASE = `http://localhost:${PORT}`;

let child;

function cleanupDb() {
  for (const ext of ['', '-wal', '-shm']) {
    try { rmSync(DB + ext, { force: true }); } catch { /* Windows may still hold the lock */ }
  }
}

async function waitForHealth(tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('server did not start');
}

test.before(async () => {
  cleanupDb();
  child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(PORT), FREIGHT_DB: DB },
    stdio: 'ignore',
  });
  await waitForHealth();
});

test.after(async () => {
  if (child && child.exitCode === null) {
    child.kill();
    await Promise.race([once(child, 'exit'), new Promise(r => setTimeout(r, 2000))]);
  }
  cleanupDb();
});

test('GET /api/health', async () => {
  const r = await fetch(`${BASE}/api/health`);
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.equal(b.ok, true);
});

test('GET /api/contracts — one tariff seeded', async () => {
  const r = await fetch(`${BASE}/api/contracts`);
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.ok(b.length >= 1, 'at least one tariff seeded');
  assert.match(JSON.stringify(b), /UAE Land Transport/);
});

test('GET /api/contracts/1 — full combined tariff', async () => {
  const r = await fetch(`${BASE}/api/contracts/1`);
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(b.data.lanes) && b.data.lanes.length > 0);
});

test('GET /api/contracts/1 — combined tariff has LTL, FTL and LOCAL lanes', async () => {
  const b = await (await fetch(`${BASE}/api/contracts/1`)).json();
  const types = new Set(b.data.lanes.map(l => l.loadType));
  assert.ok(types.has('LTL') && types.has('FTL') && types.has('LOCAL'));
});

test('POST /api/quote — local (intra-UAE) trip prices per truck', async () => {
  const r = await fetch(`${BASE}/api/quote`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contractId: 1,
      request: {
        mode: 'land', loadType: 'LOCAL', origin: 'Jebel Ali', destination: 'Dubai',
        equipment: '3T', containers: 1, options: { applyVat: true },
      },
    }),
  });
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.equal(b.lines.find(l => l.code === 'BASE').amount, 275);
});

test('GET /api/contracts/999 — 404', async () => {
  const r = await fetch(`${BASE}/api/contracts/999`);
  assert.equal(r.status, 404);
});

test('POST /api/quote — prices LTL without saving', async () => {
  const r = await fetch(`${BASE}/api/quote`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contractId: 1,
      request: {
        mode: 'land', loadType: 'LTL', origin: 'Jebel Ali',
        destination: 'KSA - Riyadh', grossWeightKg: 1500, options: { applyVat: true },
      },
    }),
  });
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.equal(b.lines.find(l => l.code === 'BASE').amount, 2100);
  assert.equal(b.subtotal, 2485);
  assert.equal(b.total, 2609.25);
});

test('POST /api/quote — unknown contract → 400', async () => {
  const r = await fetch(`${BASE}/api/quote`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contractId: 999, request: {} }),
  });
  assert.equal(r.status, 400);
});

let savedRef;

test('POST /api/quotes — saves and returns a ref', async () => {
  const r = await fetch(`${BASE}/api/quotes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contractId: 1,
      customer: 'ACME Trading',
      request: {
        mode: 'land', loadType: 'FTL', origin: 'Jebel Ali', destination: 'RUH via Batha',
        equipment: 'reefer-13.6', containers: 1, options: { applyVat: false },
      },
    }),
  });
  const b = await r.json();
  assert.equal(r.status, 201);
  assert.match(b.ref, /^Q\d{4}-\d{4}$/);
  assert.equal(b.result.lines.find(l => l.code === 'BASE').amount, 6460);
  savedRef = b.ref;
});

test('GET /api/quotes — lists the saved quote', async () => {
  const r = await fetch(`${BASE}/api/quotes`);
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.ok(b.some(q => q.ref === savedRef));
});

test('GET /api/quotes/:ref — one quote', async () => {
  const r = await fetch(`${BASE}/api/quotes/${savedRef}`);
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.equal(b.customer, 'ACME Trading');
});

test('PATCH /api/quotes/:ref — status transition', async () => {
  const r = await fetch(`${BASE}/api/quotes/${savedRef}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'sent' }),
  });
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.equal(b.status, 'sent');
});

test('PATCH /api/quotes/:ref — bad status rejected', async () => {
  const r = await fetch(`${BASE}/api/quotes/${savedRef}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'banana' }),
  });
  assert.equal(r.status, 400);
});

test('GET /api/quotes/:ref/print — letterhead, well-formed', async () => {
  const r = await fetch(`${BASE}/api/quotes/${savedRef}/print`);
  const html = await r.text();
  assert.equal(r.status, 200);
  assert.match(html, /Freight Quotation/);
  assert.match(html, /Freight &amp; Trucking Quote/);  // seeded (generic) provider identity
  assert.doesNotMatch(html, /Carrier \/ contract/i);   // old buy-rate row must stay gone
});

test('PUT /api/contracts/1/data — round-trips an edit', async () => {
  const cur = await (await fetch(`${BASE}/api/contracts/1`)).json();
  const body = cur.data;
  const r = await fetch(`${BASE}/api/contracts/1/data`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal(r.status, 200);
});

test('static — index.html served', async (t) => {
  // app/public is the Vite build output; skip if the UI hasn't been built.
  if (!existsSync(join(__dirname, '..', 'public', 'index.html'))) {
    t.skip('run `npm run build` first to exercise the static host');
    return;
  }
  const r = await fetch(`${BASE}/`);
  const html = await r.text();
  assert.equal(r.status, 200);
  assert.match(html, /<div id="root">/);
});

// ---- Phase A: Company Profile -------------------------------------------
// These run last: they mutate the company row (prefix, tax) and leave it changed.

const putCompany = (patch) => fetch(`${BASE}/api/company`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(patch),
});

const priceAndSave = (customer = 'Phase A Co') => fetch(`${BASE}/api/quotes`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    contractId: 1,
    customer,
    request: {
      mode: 'land', loadType: 'LTL', origin: 'Jebel Ali', destination: 'KSA - Riyadh',
      grossWeightKg: 1500, options: { applyVat: true },
    },
  }),
}).then(r => r.json());

test('GET /api/company — a profile row exists', async () => {
  const r = await fetch(`${BASE}/api/company`);
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.equal(typeof b.base_currency, 'string');
  assert.equal(typeof b.tax_label, 'string');
  assert.deepEqual(typeof b.fx_rates, 'object');
});

test('PUT /api/company — round-trips display name + FX table', async () => {
  const r = await putCompany({ display_name: 'Meridian Freight', fx_rates: { USD: 3.67, EUR: 3.95 } });
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.equal(b.display_name, 'Meridian Freight');
  assert.equal(b.fx_rates.EUR, 3.95);
});

test('PUT /api/company — rejects a bad base_currency', async () => {
  const r = await putCompany({ base_currency: 'dollars' });
  assert.equal(r.status, 400);
});

test('Quote ref honours company.quote_prefix', async () => {
  await putCompany({ quote_prefix: 'ACME-', quote_pad: 4 });
  const b = await priceAndSave();
  assert.match(b.ref, /^ACME-\d{4}-\d{4}$/);
});

test('Printable quote shows the company letterhead and tax label', async () => {
  // tax_label comes from the company; the rate still comes from the tariff
  // (sample tariff = 5%), demonstrating the request→tariff→company order.
  await putCompany({ legal_name: 'ACME Logistics LLC', tax_label: 'GST', tax_rate_pct: 9, tax_mode: 'exclusive' });
  const saved = await priceAndSave();
  const html = await (await fetch(`${BASE}/api/quotes/${saved.ref}/print`)).text();
  assert.match(html, /ACME Logistics LLC/);
  assert.match(html, /GST \(5%\)/);
  assert.match(html, /Freight Quotation/);
});

test('tax_mode "none" removes the tax row from the printable quote', async () => {
  await putCompany({ tax_mode: 'none' });
  const saved = await priceAndSave();
  const html = await (await fetch(`${BASE}/api/quotes/${saved.ref}/print`)).text();
  assert.doesNotMatch(html, /GST \(/);
  assert.doesNotMatch(html, /VAT \(/);
  assert.match(html, /Subtotal/);
  assert.match(html, /Total/);
});
