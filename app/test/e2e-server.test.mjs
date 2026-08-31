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
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = join(__dirname, '..', 'server.mjs');
const DB = join(tmpdir(), `freight_e2e_${process.pid}_${Date.now()}.db`);
const PORT = 4793;
const BASE = `http://localhost:${PORT}`;

const FORBIDDEN = /aramex|modern\s*line/i;
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

test('GET /api/contracts — seeded, no provenance', async () => {
  const r = await fetch(`${BASE}/api/contracts`);
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.ok(b.length >= 1, 'at least one tariff seeded');
  assert.doesNotMatch(JSON.stringify(b), FORBIDDEN);
});

test('GET /api/contracts/1 — full tariff, no provenance', async () => {
  const r = await fetch(`${BASE}/api/contracts/1`);
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(b.data.lanes) && b.data.lanes.length > 0);
  assert.equal(b.customer, null, 'seed tariff carries no customer name');
  assert.doesNotMatch(JSON.stringify(b), FORBIDDEN);
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

test('GET /api/quotes/:ref/print — HTML with no provenance rows', async () => {
  const r = await fetch(`${BASE}/api/quotes/${savedRef}/print`);
  const html = await r.text();
  assert.equal(r.status, 200);
  assert.match(html, /Freight Quotation/);
  assert.doesNotMatch(html, FORBIDDEN);
  assert.doesNotMatch(html, /Rate agreement/i);
  assert.doesNotMatch(html, /Carrier \/ contract/i);
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

test('static — index.html served, shows no provenance', async () => {
  const r = await fetch(`${BASE}/`);
  const html = await r.text();
  assert.equal(r.status, 200);
  assert.doesNotMatch(html, FORBIDDEN);
  assert.doesNotMatch(html, /Rate agreement/i);
});
