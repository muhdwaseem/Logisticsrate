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
import { defaultTariff, whiteEagleTariff, provider } from './seed-tariff.mjs';

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

-- Single-row company profile (id is always 1). Drives branding, tax wording,
-- quote numbering and currency defaults. See docs/PHASE-A-COMPANY-PROFILE.md.
CREATE TABLE IF NOT EXISTS company (
  id                      INTEGER PRIMARY KEY CHECK (id = 1),
  legal_name              TEXT,
  display_name            TEXT,
  logo                    TEXT,                  -- data URI, PNG/SVG, <= 64 KB
  address                 TEXT,
  city                    TEXT,
  country                 TEXT,
  tax_id                  TEXT,                  -- VRN / GST No. / EIN / VAT ID
  email                   TEXT,
  phone                   TEXT,
  website                 TEXT,
  base_currency           TEXT DEFAULT 'AED',
  fx_rates_json           TEXT DEFAULT '{}',     -- { CUR: units_per_1_base }
  tax_label               TEXT DEFAULT 'VAT',
  tax_rate_pct            REAL DEFAULT 0,
  tax_mode                TEXT DEFAULT 'exclusive',  -- exclusive | none
  default_incoterm        TEXT DEFAULT 'EXW',
  default_validity_days   INTEGER DEFAULT 14,
  quote_prefix            TEXT DEFAULT 'Q',      -- carries its own separator, e.g. 'ACME-'
  quote_pad               INTEGER DEFAULT 4,
  quote_footer_notes_json TEXT DEFAULT '[]',    -- string[]
  bank_details            TEXT,
  setup_complete          INTEGER NOT NULL DEFAULT 0,
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

function safeParse(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

// ---- seed ------------------------------------------------------------------
// A database from an earlier build keeps whatever it was first seeded with;
// run `npm run reset-db` once to re-seed from the current sample tariff.
function seedIfEmpty() {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM carriers').get();
  if (count > 0) return;
  const insCarrier = db.prepare('INSERT INTO carriers (name, country, contact, email) VALUES (?, ?, ?, ?)');
  const insContract = db.prepare('INSERT INTO contracts (carrier_id, name, customer, currency, data_json) VALUES (?, ?, ?, ?, ?)');
  for (const c of [defaultTariff, whiteEagleTariff]) {
    const carrierId = insCarrier.run(c.carrier.name, c.carrier.country, c.carrier.contact, c.carrier.email).lastInsertRowid;
    insContract.run(
      carrierId, c.contract.name, c.contract.customer, c.contract.currency,
      JSON.stringify({ contract: c.contract, lanes: c.lanes, accessorials: c.accessorials }),
    );
  }
  console.log('[db] seeded Aramex + White Eagle tariffs');
}
seedIfEmpty();

// Ensure the single company row exists, pre-filled with the provider identity
// (Aramex) from seed-tariff.mjs so the letterhead is right out of the box.
function ensureCompanyRow() {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM company').get();
  if (count > 0) return;
  const anyContract = db.prepare('SELECT currency, data_json FROM contracts ORDER BY id LIMIT 1').get();
  let baseCurrency = provider.base_currency || 'AED';
  if (anyContract) {
    const c = safeParse(anyContract.data_json, {})?.contract || {};
    baseCurrency = c.currency || anyContract.currency || baseCurrency;
  }
  db.prepare(`
    INSERT INTO company
      (id, legal_name, display_name, address, city, country, email, phone, website,
       base_currency, tax_label, tax_rate_pct, tax_mode,
       default_incoterm, quote_footer_notes_json, setup_complete)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'exclusive', ?, ?, 1)
  `).run(
    provider.legal_name ?? null, provider.display_name ?? null,
    provider.address ?? null, provider.city ?? null, provider.country ?? null,
    provider.email ?? null, provider.phone ?? null, provider.website ?? null,
    baseCurrency, provider.tax_label ?? 'VAT', Number(provider.tax_rate_pct) || 0,
    provider.default_incoterm ?? 'FCA Jebel Ali',
    JSON.stringify(provider.quote_footer_notes ?? []),
  );
  console.log('[db] created company profile row (Aramex)');
}
ensureCompanyRow();

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

export function nextQuoteRef({ prefix = 'Q', pad = 4 } = {}) {
  const yr = new Date().getFullYear();
  const { n } = db.prepare(
    "SELECT COUNT(*) + 1 AS n FROM quotes WHERE ref LIKE ?"
  ).get(`${prefix}${yr}-%`);
  return `${prefix}${yr}-${String(n).padStart(pad, '0')}`;
}

// ---- company profile --------------------------------------------------------
export function getCompany() {
  const row = db.prepare('SELECT * FROM company WHERE id = 1').get();
  if (!row) return null;
  const { fx_rates_json, quote_footer_notes_json, ...rest } = row;
  return {
    ...rest,
    fx_rates: safeParse(fx_rates_json, {}),
    quote_footer_notes: safeParse(quote_footer_notes_json, []),
    setup_complete: !!row.setup_complete,
  };
}

const COMPANY_COLUMNS = [
  'legal_name', 'display_name', 'logo', 'address', 'city', 'country', 'tax_id',
  'email', 'phone', 'website', 'base_currency', 'tax_label', 'tax_rate_pct',
  'tax_mode', 'default_incoterm', 'default_validity_days', 'quote_prefix',
  'quote_pad', 'bank_details', 'setup_complete',
];

export function updateCompany(patch = {}) {
  const sets = [];
  const vals = [];
  for (const col of COMPANY_COLUMNS) {
    if (patch[col] === undefined) continue;
    sets.push(`${col} = ?`);
    vals.push(typeof patch[col] === 'boolean' ? (patch[col] ? 1 : 0) : patch[col]);
  }
  if (patch.fx_rates !== undefined) {
    sets.push('fx_rates_json = ?');
    vals.push(JSON.stringify(patch.fx_rates ?? {}));
  }
  if (patch.quote_footer_notes !== undefined) {
    sets.push('quote_footer_notes_json = ?');
    vals.push(JSON.stringify(patch.quote_footer_notes ?? []));
  }
  sets.push("updated_at = datetime('now')");
  db.prepare(`UPDATE company SET ${sets.join(', ')} WHERE id = 1`).run(...vals);
  return getCompany();
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
