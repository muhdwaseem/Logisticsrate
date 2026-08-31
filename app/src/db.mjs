/**
 * Persistence layer — Node's built-in SQLite (node:sqlite).
 *
 * Zero npm dependencies so the starter runs anywhere Node 22.5+ is present.
 * The rate card for each carrier contract is kept as one JSON document
 * (easy to edit whole in the UI); quotes are stored as real rows so they
 * can be listed, filtered and reported on.
 *
 * Production note: swap this file for PostgreSQL + a migration tool. The
 * public functions below are the seam — keep their signatures and the rest
 * of the app is unaffected.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultTariff } from './seed-tariff.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.FREIGHT_DB || join(__dirname, '..', '..', 'data', 'freight.db');

mkdirSync(dirname(DB_PATH), { recursive: true });
export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS carriers (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  country    TEXT,
  contact    TEXT,
  email      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contracts (
  id         INTEGER PRIMARY KEY,
  carrier_id INTEGER NOT NULL REFERENCES carriers(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  customer   TEXT,
  currency   TEXT NOT NULL DEFAULT 'AED',
  data_json  TEXT NOT NULL,          -- { contract, lanes, accessorials }
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quotes (
  id             INTEGER PRIMARY KEY,
  ref            TEXT NOT NULL UNIQUE,
  contract_id    INTEGER REFERENCES contracts(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  customer       TEXT,
  mode           TEXT,
  load_type      TEXT,
  origin         TEXT,
  destination    TEXT,
  quote_currency TEXT,
  total          REAL,
  status         TEXT NOT NULL DEFAULT 'draft',   -- draft | sent | won | lost
  request_json   TEXT NOT NULL,
  result_json    TEXT NOT NULL
);
`);

// ---- seed ------------------------------------------------------------------
// A database from an earlier build keeps whatever it was first seeded with;
// run `npm run reset-db` once to re-seed from the current sample tariff.
function seedIfEmpty() {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM carriers').get();
  if (count > 0) return;
  const c = defaultTariff;
  const carrierId = db.prepare(
    'INSERT INTO carriers (name, country, contact, email) VALUES (?, ?, ?, ?)'
  ).run(c.carrier.name, c.carrier.country, c.carrier.contact, c.carrier.email).lastInsertRowid;

  db.prepare(
    'INSERT INTO contracts (carrier_id, name, customer, currency, data_json) VALUES (?, ?, ?, ?, ?)'
  ).run(
    carrierId, c.contract.name, c.contract.customer, c.contract.currency,
    JSON.stringify({ contract: c.contract, lanes: c.lanes, accessorials: c.accessorials })
  );
  console.log('[db] seeded sample tariff');
}
seedIfEmpty();

// ---- queries -------------------------------------------------------------
export function listCarriers() {
  return db.prepare('SELECT * FROM carriers ORDER BY name').all();
}

export function listContracts() {
  return db.prepare(`
    SELECT ct.id, ct.name, ct.customer, ct.currency, ct.updated_at, cr.name AS carrier
    FROM contracts ct JOIN carriers cr ON cr.id = ct.carrier_id
    ORDER BY ct.updated_at DESC
  `).all();
}

export function getContract(id) {
  const row = db.prepare(`
    SELECT ct.*, cr.name AS carrier, cr.email AS carrier_email
    FROM contracts ct JOIN carriers cr ON cr.id = ct.carrier_id WHERE ct.id = ?
  `).get(id);
  if (!row) return null;
  return { ...row, data: JSON.parse(row.data_json) };
}

export function updateContractData(id, data) {
  const res = db.prepare(
    "UPDATE contracts SET data_json = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(JSON.stringify(data), id);
  return res.changes > 0;
}

export function createContract({ carrierName, name, customer, currency = 'AED', data }) {
  let carrier = db.prepare('SELECT id FROM carriers WHERE name = ?').get(carrierName);
  const carrierId = carrier
    ? carrier.id
    : db.prepare('INSERT INTO carriers (name) VALUES (?)').run(carrierName).lastInsertRowid;
  const id = db.prepare(
    'INSERT INTO contracts (carrier_id, name, customer, currency, data_json) VALUES (?, ?, ?, ?, ?)'
  ).run(carrierId, name, customer, currency, JSON.stringify(data)).lastInsertRowid;
  return getContract(id);
}

export function nextQuoteRef() {
  const yr = new Date().getFullYear();
  const { n } = db.prepare(
    "SELECT COUNT(*) + 1 AS n FROM quotes WHERE ref LIKE ?"
  ).get(`Q${yr}-%`);
  return `Q${yr}-${String(n).padStart(4, '0')}`;
}

export function saveQuote({ ref, contractId, customer, request, result }) {
  db.prepare(`
    INSERT INTO quotes (ref, contract_id, customer, mode, load_type, origin, destination, quote_currency, total, request_json, result_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    ref, contractId ?? null, customer ?? null,
    request.mode ?? null, request.loadType ?? null, request.origin ?? null, request.destination ?? null,
    result.quoteCurrency ?? null, result.total ?? null,
    JSON.stringify(request), JSON.stringify(result)
  );
  return getQuote(ref);
}

export function getQuote(ref) {
  const row = db.prepare('SELECT * FROM quotes WHERE ref = ?').get(ref);
  if (!row) return null;
  return { ...row, request: JSON.parse(row.request_json), result: JSON.parse(row.result_json) };
}

export function listQuotes({ limit = 100 } = {}) {
  return db.prepare(`
    SELECT ref, customer, mode, load_type, origin, destination, quote_currency, total, status, created_at
    FROM quotes ORDER BY created_at DESC, id DESC LIMIT ?
  `).all(limit);
}

export function setQuoteStatus(ref, status) {
  const res = db.prepare('UPDATE quotes SET status = ? WHERE ref = ?').run(status, ref);
  return res.changes > 0;
}
