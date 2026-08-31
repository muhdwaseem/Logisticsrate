# Phase A — Company Profile & branded quote

**Status:** ✅ built on branch `worktree-whitelabel-ui`. All 7 deliverables
shipped; 40 tests green (11 new). Scope: the first slice of
`docs/GENERALIZATION-PLAN.md` (§3, §4.4, §5.2, §5.3, §5.5, H3, H11–H14).
This document is the as-built spec.

**Goal:** every screen and every quote carries *this company's* identity,
currency label, tax wording and quote numbering — driven by one editable
profile, no code change per client. A logistics company can fill in a Settings
form and immediately send a quotation on its own letterhead.

**Deliberately non-breaking.** `company` is optional throughout:
`computeQuote(request, tariffData)` with no third argument behaves exactly as
today, and all 29 existing tests must stay green untouched. The engine's
currency maths, FX handling and place-name predicates are **not** touched here —
those are Phases B/C. This phase only adds an identity layer and makes the tax
line configurable.

---

## 1. What ships in Phase A

| # | Deliverable | Size |
|---|---|---|
| A1 | `company` table + `getCompany` / `updateCompany` + defaults row & migration | M |
| A2 | `GET /api/company` and `PUT /api/company` | S |
| A3 | `SettingsView.tsx` bound to the API, incl. an FX-table editor | M |
| A4 | Top-bar logo + `display_name` (H12) | S |
| A5 | Branded quote letterhead: logo, from-block, `tax_id`, bank details, footer notes (H11, §5.5) | M |
| A6 | Configurable tax: `tax_label` + `tax_mode` through engine result → UI ledger → quote doc (H3, §4.4) | M |
| A7 | Quote-ref prefix / pad from the profile (H13) | S |

**Not in Phase A** (tracked in the generalization plan):
base-currency-neutral FX and dropping `DEFAULT_FX_TO_AED` (Phase C, §4.1);
data-driven `appliesWhen` objects (Phase C, §4.2); `cargoValueAed → cargoValue`
and "pickup emirate → zone" renames (Phase B); EU/US example tariffs and the
guided first-run wizard `#view-setup` (Phase D). Phase A ships the Settings
screen you can edit any time; the 3-step onboarding wizard comes later.

---

## 2. Data model — `company` table

Single row, `id` always `1`. Same storage pattern as tariffs: plain columns plus
one JSON blob for the open-ended lists.

```sql
CREATE TABLE IF NOT EXISTS company (
  id                    INTEGER PRIMARY KEY CHECK (id = 1),
  legal_name            TEXT,
  display_name          TEXT,
  logo                  TEXT,            -- data URI, PNG/SVG, <= 64 KB
  address               TEXT,            -- multiline
  city                  TEXT,
  country               TEXT,
  tax_id                TEXT,            -- VRN / GST No. / EIN / VAT ID
  email                 TEXT,
  phone                 TEXT,
  website               TEXT,
  base_currency         TEXT DEFAULT 'AED',   -- ISO 4217
  fx_rates_json         TEXT DEFAULT '{}',    -- { CUR: units_per_1_base }
  tax_label             TEXT DEFAULT 'VAT',   -- "" when tax_mode = none
  tax_rate_pct          REAL DEFAULT 0,
  tax_mode              TEXT DEFAULT 'exclusive',  -- exclusive | none
  default_incoterm      TEXT DEFAULT 'EXW',
  default_validity_days INTEGER DEFAULT 14,
  quote_prefix          TEXT DEFAULT 'Q',     -- carries its own separator, e.g. 'ACME-'
  quote_pad             INTEGER DEFAULT 4,
  quote_footer_notes_json TEXT DEFAULT '[]',  -- string[]
  bank_details          TEXT,            -- multiline, optional
  setup_complete        INTEGER NOT NULL DEFAULT 0,
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
```

`getCompany()` returns the row with `fx_rates`, `quote_footer_notes` parsed from
their `_json` columns (mirrors how `getContract` parses `data_json`).

### Migration / defaults (`db.mjs`, after the other `CREATE TABLE`s)

1. `CREATE TABLE IF NOT EXISTS company (...)`.
2. If `SELECT COUNT(*) FROM company` is `0`, insert one defaults row:
   - `base_currency` ← the first existing contract's `currency` if any, else `'AED'`.
   - `setup_complete` ← `1` when a tariff already exists (don't nag existing
     users), else `0`.
   - `tax_label`/`tax_rate_pct` seeded from the sample tariff's
     `contract.vatPct` when present (`'VAT'`, `5`).
3. No change to `carriers` / `contracts` / `quotes`. `contracts.currency` stays
   as-is; Phase C revisits it.

**Resolution order** wherever a tax rate, label, incoterm, validity or currency
is needed: `request` → active `tariff.contract` → `company` → built-in fallback.
Today it is `request → tariff → 'AED'`; Phase A inserts the `company` step for
tax label/mode/rate, incoterm and validity only.

---

## 3. Backend changes

### 3.1 `app/src/db.mjs`

| Change | Detail |
|---|---|
| `company` table + defaults row | §2 |
| `export function getCompany()` | one row, `_json` fields parsed; always returns an object (never `null`) |
| `export function updateCompany(patch)` | whitelist-update the known columns, re-serialise `fx_rates` / `quote_footer_notes`, bump `updated_at`; return `getCompany()` |
| `nextQuoteRef()` (`db.mjs:126`) | take `{ prefix, pad }` (from `getCompany()`); ref = `` `${prefix}${yr}-${String(n).padStart(pad,'0')}` ``; counter query `WHERE ref LIKE '${prefix}${yr}-%'`. Default `prefix='Q'`, `pad=4` reproduces today's `Q2026-0001` exactly. |

### 3.2 `app/server.mjs`

| Route | Behaviour |
|---|---|
| `GET /api/company` | `json(res, 200, getCompany())` |
| `PUT /api/company` | body = partial profile; validate `base_currency` is 3 letters, `tax_mode ∈ {exclusive,none}`, `logo` ≤ 64 KB and `data:` URI, `quote_pad` 1–8; `json(res, 200, updateCompany(body))` |
| `POST /api/quote`, `POST /api/quotes` | pass `getCompany()` as the 3rd arg to `computeQuote(request, c.data, company)` |
| `POST /api/quotes` | build the ref with `nextQuoteRef({ prefix: company.quote_prefix, pad: company.quote_pad })` |
| `GET /api/quotes/:ref/print` | `renderQuoteHtml(q, contract, getCompany())` |

### 3.3 `app/src/rate-engine.mjs` — tax only

`computeQuote(request, contractData, company = null)`.

Replace the bare VAT block (`rate-engine.mjs:272-274`) with tax resolution:

```js
const taxMode  = company?.tax_mode ?? (contract.taxMode ?? 'exclusive');
const taxLabel = company?.tax_label ?? contract.taxLabel ?? 'VAT';
const taxPctResolved =
  request.options?.applyVat === false || taxMode === 'none'
    ? 0
    : Number(contract.vatPct ?? contract.taxRatePct ?? company?.tax_rate_pct ?? 0);
const taxAmount = round2(subtotal * taxPctResolved / 100);
```

Result object:

```js
return {
  ...,
  subtotal,
  tax: { label: taxLabel, pct: taxPctResolved, amount: taxAmount, mode: taxMode },
  // aliases kept so nothing downstream breaks this phase:
  vatPct: taxPctResolved,
  vat: taxAmount,
  total: round2(subtotal + taxAmount),
  meta: {
    ...,
    incoterm: request.incoterm || contract.incoterm || company?.default_incoterm || 'EXW',
    validUntil: addDays(new Date(),
      Number(contract.validityDays) || company?.default_validity_days || 14
    ).toISOString().slice(0, 10),
    footerNotes: company?.quote_footer_notes ?? [],
  },
};
```

No other engine line changes. `DEFAULT_FX_TO_AED`, `convert()`, `PREDICATES`,
`cargoValueAed` — all untouched here.

### 3.4 `app/src/quote-doc.mjs`

`renderQuoteHtml(q, contract, company = null)` — §4 below. Ledger reads
`r.tax.label` / `r.tax.pct` / `r.tax.amount` (fall back to `r.vatPct` / `r.vat`
if `r.tax` is absent, for pre-Phase-A stored quotes).

---

## 4. Branded quote letterhead (`quote-doc.mjs`)

The printable quote is what the client's customer actually receives (browser →
Print → Save as PDF). Phase A turns its fixed `◈ / "Freight Quotation"` header
into a real letterhead driven entirely by the profile.

| Band | Content | Source | Rule when unset |
|---|---|---|---|
| **Letterhead** | logo (left); legal name, `address`, `city, country`, `Tax ID: …`, `email · phone · website` (right) | `company.*` | no `logo` → keep the current `◈` SVG glyph; no company row / all-blank → current generic header |
| **Document title** | "Freight Quotation" · ref · issued · valid-until · status | `q.ref`, `q.created_at`, `r.meta.validUntil`, `q.status` | unchanged |
| **Parties** | **From** = company short block · **To** = `q.customer` | `company`, `q.customer` | omit the "From" column when no company identity |
| **Shipment** | mode · load type · origin → destination · incoterm · chargeable qty + basis | `q.request`, `r.meta` | unchanged |
| **Charge table** | label + detail, qty × unit, original-currency amount, quote-currency amount | `r.lines[]` | unchanged |
| **Ledger** | Subtotal · `${r.tax.label} (${r.tax.pct}%)` · **Total** | `r.tax`, `r.total` | `r.tax.mode === 'none'` (or `pct === 0` from mode) → **omit the tax row** |
| **Notes & exclusions** | tariff notes + `company.quote_footer_notes`, appended | `r.meta.notes`, `r.meta.footerNotes` | notes only |
| **Payment** *(optional band)* | `bank_details` block | `company.bank_details` | omit the band entirely when empty |
| **Fine print** | standing VATOS / duties-excluded paragraph | static | unchanged |

Constraints:

- Never emit a literal `"VAT"` or `"AED"` in the ledger — use `r.tax.label` and
  `r.quoteCurrency`.
- `tax_mode: "none"` → omit the tax row **and** surface the relevant footer note
  (e.g. an EU reverse-charge line) if the tariff/company defines one.
- Same route, same "Print / Save as PDF" button, same `@media print` CSS.
- The white-label guard test (`e2e-server.test.mjs` "static … no provenance")
  and a new currency/word guard (§6) run against this HTML.

---

## 5. Frontend changes (`app/web`)

### 5.1 `src/api.ts`

```ts
export interface Company {
  legal_name: string; display_name: string; logo: string;
  address: string; city: string; country: string; tax_id: string;
  email: string; phone: string; website: string;
  base_currency: string; fx_rates: Record<string, number>;
  tax_label: string; tax_rate_pct: number; tax_mode: 'exclusive' | 'none';
  default_incoterm: string; default_validity_days: number;
  quote_prefix: string; quote_pad: number;
  quote_footer_notes: string[]; bank_details: string;
  setup_complete: boolean;
}
export const getCompany = () => api<Company>('/api/company');
export const putCompany = (patch: Partial<Company>) =>
  api<Company>('/api/company', { method: 'PUT', body: JSON.stringify(patch) });
```

Add `tax?: { label: string; pct: number; amount: number; mode: string }` to
`QuoteResult` (keep `vat` / `vatPct` optional for old rows).

### 5.2 `src/App.tsx`

- On boot, `getCompany()` alongside `getContracts()`; hold `company` in state,
  pass to `QuoteView`, `SavedView`, `SettingsView`.
- Top bar: `company.logo` → `<img class="logo">` (fallback to the inline SVG when
  empty); brand `<strong>` = `company.display_name || 'Freight Rate & Quotation'`.
- New route `/settings` + a fourth `NavLink` "Settings".
- Optional: if `!company.setup_complete`, show a one-line banner above `<main>`
  linking to `/settings` ("Finish setting up your company →"). The full wizard is
  Phase D.

### 5.3 `src/views/SettingsView.tsx` (new)

One `<form>` grouped like `QuoteView`'s `.fg` sections:

1. **Identity** — display name, legal name, logo (file input → base64 data URI,
   reject > 64 KB client-side), address, city, country, tax id, email, phone,
   website.
2. **Money & tax** — base currency; tax mode (`exclusive` / `none`); tax label;
   tax rate %; an **FX-table editor** — rows of `CUR → rate`, add/remove, written
   back as `fx_rates`.
3. **Quotation** — quote prefix, pad width, default incoterm, default validity
   days, bank details (textarea), footer notes (one per line → `string[]`).

Save button → `putCompany(form)` → toast "Company profile saved". Reuse the
existing `.card` / `.fg` / `.field` / `.btn` styles; no new CSS needed.

### 5.4 `src/views/QuoteView.tsx`

| Control | Change |
|---|---|
| "Apply VAT" checkbox | label = `Apply ${company.tax_label}`; hide the checkbox entirely when `company.tax_mode === 'none'` |
| result ledger "VAT (5%)" | `${result.tax.label} (${result.tax.pct}%)`; hide the row when `result.tax.mode === 'none'` |

No change to `cargoValueAed`, the currency `<select>`, origin default or pickup
emirate — those are Phase B.

### 5.5 `src/views/SavedView.tsx`

`money(q.total, q.quote_currency || company.base_currency)` instead of the
hard-coded `'AED'` fallback.

---

## 6. Test plan

**Must not change:** all 29 current tests, including the golden numbers
(`LTL Riyadh 1500 kg → 2609.25`, `FTL RUH via Batha → 6635`, …). Calling
`computeQuote` with two args must be byte-identical to today.

**Add to `rate-engine.test.mjs`:**

- `computeQuote(req, tariff, { tax_mode: 'none' })` → `result.tax.pct === 0`,
  `result.tax.amount === 0`, `result.total === result.subtotal`.
- `computeQuote(req, tariff, { tax_label: 'GST', tax_rate_pct: 9 })` with a
  tariff that has **no** `vatPct` → tax line uses `GST` and `9%`.
- Tariff `vatPct` still wins over `company.tax_rate_pct` (resolution order).
- `result.vat` / `result.vatPct` aliases still equal `result.tax.*`.

**Add to `e2e-server.test.mjs`:**

- `GET /api/company` returns a row; `PUT` round-trips a `display_name` +
  `fx_rates` change.
- `POST /api/quotes` after setting `quote_prefix: 'ACME-'` → ref matches
  `/^ACME-\d{4}-\d{4}$/`.
- `GET /api/quotes/:ref/print` after setting `legal_name` → HTML contains the
  legal name and the `tax_label`; still `assert.doesNotMatch(html, FORBIDDEN)`.
- New guard: with `tax_mode: 'none'`, the print HTML contains **no** `VAT` /
  `Tax` ledger row and no `AED` literal outside the FX context.

**Manual:** set a logo + bank details + a `GST 9%` profile, price and save a
quote, open the printable — letterhead, from-block, GST line and payment band
all render; flip to `tax_mode: none` and the tax row disappears with the footer
note showing.

---

## 7. Build order

1. **A1 + A2** — table, `getCompany`/`updateCompany`, two routes, defaults row.
   Ship; nothing else consumes it yet. (½ day)
2. **A7** — `nextQuoteRef` takes prefix/pad; wire in `server.mjs`. Cheap, isolated.
3. **A6** — engine tax resolution + `result.tax`; update `rate-engine.test.mjs`.
   This is the only engine touch — do it behind the new tests.
4. **A4 + A5** — top bar and `quote-doc.mjs` letterhead (both read `getCompany()`).
5. **A3** — `SettingsView.tsx` + the `/settings` route; then the small
   `QuoteView` / `SavedView` label tweaks (A6 UI side).
6. Run `npm test`; manual pass of §6; update `README.md` (Settings screen,
   `/api/company`) and mark Phase A done in `docs/GENERALIZATION-PLAN.md §9`.

Estimate: **~1 focused day**, matching the generalization plan's Phase A row.

---

## 8. Open decisions

1. **Settings home** — a dedicated `/settings` tab (assumed here) or fold into the
   existing Tariffs screen?
2. **Logo storage** — base64 data URI in SQLite (assumed, ≤ 64 KB, no file
   serving) or a real uploaded file under `app/public/`?
3. **`tax_mode` values** — `exclusive` / `none` is enough for Phase A. Add
   `inclusive` (tax-in pricing) now, or defer until a client needs it?
4. **First-run nudge** — ship the one-line "finish setup" banner in Phase A, or
   wait for the full wizard in Phase D?
5. **FX in Phase A** — the Settings FX-table editor writes `company.fx_rates`,
   but the engine keeps AED-anchored maths until Phase C. Confirm it's fine to
   store the table now and consume it later (the quote-currency picker that uses
   it is Phase B).
