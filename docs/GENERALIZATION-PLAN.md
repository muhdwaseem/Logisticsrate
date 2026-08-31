# Generalization plan — from one UAE tariff to a product any logistics company can run

**Status:** planning only, no code written yet. Scope chosen: *"Just plan it"*.

The redesigned app (branch `worktree-whitelabel-ui`) is already **white-label**
(no source carrier, customer, or signed agreement anywhere) and the rate engine
is already **data-driven** for lanes, breaks, surcharges and FX. What it is *not*
yet is **region-neutral** or **company-aware**: currency, tax, pickup zones and a
handful of engine predicates still assume a UAE freight forwarder, and there is
no place for a company to enter its own name, logo, address or tax number.

This document inventories every assumption, specifies the **Company Profile**
model that removes them, lists the screen-by-screen changes, specs a 3-region
example-tariff set, and estimates the work in sequenced phases.

Target outcome: a consultant can `git clone`, run `node server.mjs`, complete a
5-minute setup wizard, load a client's tariff, and hand over a branded,
correctly-taxed quoting tool — for a forwarder in Dubai, a road haulier in
Rotterdam, or an LTL broker in Chicago, with no code change.

---

## 1. Current state — generic vs. hard-coded

### Already generic (no change needed)

| Area | Where | Note |
|---|---|---|
| Chargeable weight — air ÷6000, land ÷4000, sea W/M | `rate-engine.mjs:14,33-74` | Industry standard; expose as tariff overrides (nice-to-have, low priority). |
| Weight-break tariff lookup + min charge | `rate-engine.mjs:78-88,182-195` | Fully data-driven. |
| Flat per-equipment rate (FTL/FCL) | `rate-engine.mjs:196-206` | Fully data-driven. |
| Quote-based lanes (manual buy rate) | `rate-engine.mjs:207-213` | Fully data-driven. |
| Markup (% / flat) | `rate-engine.mjs:216-219` | Generic. |
| Accessorial bases (`per_kg`, `per_container`, `per_shipment`, `percent_of_base`, `percent_of_value`, `flat`) | `rate-engine.mjs:122-133` | Generic; `percent_of_value` field name is the only issue (see 1.2). |
| Multi-currency lines with FX | `rate-engine.mjs:90-99` | Works, but AED-anchored — see 1.3. |
| Quote pipeline (draft/sent/won/lost), sequential ref, immutable stored result | `db.mjs`, `server.mjs` | Generic. |
| Tariff JSON viewer + editor | `public/app.js:renderRates`, `index.html#view-rates` | Generic. |

### Hard-coded region / currency / company assumptions

| # | Assumption | Location(s) | Fix owner |
|---|---|---|---|
| H1 | Base/anchor currency is **AED** | `rate-engine.mjs:17-18,91,95-99,160,180`; `db.mjs:41,115`; `quote-doc.mjs:9`; `public/app.js:293`; `public/index.html:126` | Company Profile `base_currency` + engine FX rework (§3, §4). |
| H2 | Quote-currency picker is a fixed `AED / USD` `<select>` | `public/index.html:126` | Populate from `company.fx_rates ∪ tariff.fx` (§5.4). |
| H3 | Tax is labelled **"VAT"**, rate lives only as a bare `vatPct` number | `rate-engine.mjs:272-274,283`; `quote-doc.mjs:94`; `public/app.js:193`; `public/index.html:131` | Company Profile `tax_label` + `tax_rate_pct` + `tax_mode` (§3). |
| H4 | Cargo-value field is named `cargoValueAed`, labelled "Cargo value (AED)" | `public/index.html:139`; `public/app.js:156`; `rate-engine.mjs:126,146`; `test/rate-engine.test.mjs:102` | Rename to `cargoValue`, label with active quote currency (§4, §5.4). |
| H5 | Origin defaults to **"Jebel Ali"**, datalist is 9 UAE zones | `public/index.html:66-70` | Default + datalist derived from the active tariff's lane origins (§5.4). |
| H6 | "Pickup **emirate**" select — Sharjah/Ajman/UAQ/RAK/Fujairah | `public/index.html:140-146`; `public/app.js:156` | Rename to "Pickup **zone**"; options from tariff collection accessorials; hide row when tariff has none (§5.4). |
| H7 | Engine predicates hard-code UAE places: `if_pickup_other_emirate` (Jebel Ali/Dubai/Sharjah), `if_origin_saif`, `if_origin_dafza`, `if_origin_jebelali_nonduty` | `rate-engine.mjs:112-116` | Replace with data-driven `appliesWhen` rule objects (§4.2). |
| H8 | Collection accessorials matched on an `emirate` field | `rate-engine.mjs:253-254`; `seed-tariff.mjs:139-146` | Rename lane/accessorial field `emirate` → `zone` (§4.2). |
| H9 | `contracts.currency` column defaults to `'AED'`; `createContract()` default param `'AED'` | `db.mjs:41,115` | Default to `company.base_currency`; make column nullable + resolve at read. |
| H10 | Seed data is 100% UAE (carrier country `AE`, GCC lanes, BOE docs, emirate collections, VAT 5%, incoterm "FCA Jebel Ali") | `seed-tariff.mjs` (whole file) | Keep as **one** example; add EU + US examples; seeder installs the one picked at setup (§6). |
| H11 | No company identity anywhere — printable quote header is a generic "Freight Quotation" with no "from" block, logo, address, tax id or bank details | `quote-doc.mjs:48-69` | Company Profile drives a full letterhead (§5.5). |
| H12 | App title / logo is a fixed glyph + "Freight Rate & Quotation" | `public/index.html:10-20` | Company logo + `company.display_name` (§5.2). |
| H13 | Quote ref prefix `Q`, 4-digit pad, calendar-year reset | `db.mjs:nextQuoteRef` | Company Profile `quote_prefix`, `quote_pad` (§3). |
| H14 | Quote validity default 14 days, incoterm default `EXW` | `rate-engine.mjs:289,288` | Company Profile `default_validity_days`, `default_incoterm`. |

### Not region-specific, leave alone

`originDutyPaid`, `originalDocsReceived` (sea), `dangerousGoods`, `insure`,
load types (LTL/FTL/LCL/FCL/GENERAL/CLEARANCE), the `Q…` ref format shape,
`incoterm` as a free field. These are universal freight concepts.

---

## 2. What "generalized" means, concretely

Three properties, in priority order:

1. **Company-aware** — every quote and screen carries *this company's* identity,
   currency, tax and numbering. One editable profile, no code.
2. **Region-neutral engine** — no place name, currency code or tax word compiled
   into `rate-engine.mjs`. Everything comes from the tariff + profile.
3. **Demonstrable for any region out of the box** — ships with UAE, EU-road and
   US-LTL example tariffs so a demo works before the client's real rates are loaded.

---

## 3. Company Profile — data model

New single-row table `company` (id always `1`), plus `GET /api/company` and
`PUT /api/company`. Stored the same way as tariffs: plain columns + a JSON blob
for the open-ended bits.

| Field | Type | Purpose | Replaces |
|---|---|---|---|
| `legal_name` | text | Letterhead legal entity | H11 |
| `display_name` | text | App title, short name | H12 |
| `logo` | text (data URI, ≤ 64 KB PNG/SVG) | App header + quote letterhead | H11, H12 |
| `address` | text (multiline) | Quote "from" block | H11 |
| `city`, `country` | text | Quote "from" block | H11 |
| `tax_id` | text | VRN / GST No. / EIN / VAT ID on the quote | H11 |
| `email`, `phone`, `website` | text | Quote contact line | H11 |
| `base_currency` | text (ISO 4217) | The anchor all FX converts through; default line/quote currency | H1, H9 |
| `fx_rates` | JSON `{ CUR: rate_to_base }` | Company default FX table; a tariff may still override per-tariff | H1, H2 |
| `tax_label` | text (`"VAT"`, `"GST"`, `"Sales Tax"`, `"VAT (reverse charge)"`, `""`) | Tax line label on quote + checkbox | H3 |
| `tax_rate_pct` | number | Default tax rate; a tariff may override | H3 |
| `tax_mode` | text (`"exclusive"` \| `"none"`) | `none` hides the tax line entirely | H3 |
| `default_incoterm` | text | Prefill; request/tariff still override | H14 |
| `default_validity_days` | number | Quote expiry | H14 |
| `quote_prefix` | text (default `"Q"`) | Ref like `ACME-2026-0001` | H13 |
| `quote_pad` | number (default `4`) | Zero-pad width | H13 |
| `quote_footer_notes` | JSON string[] | Appended under every quote's "Notes & exclusions" | — |
| `bank_details` | text (multiline, optional) | Payment block on the quote | — |
| `setup_complete` | bool | Gates the first-run wizard (§5.1) | — |

**Resolution order** everywhere a currency/tax/validity is needed:
`request` value → active `tariff.contract` value → `company` value → built-in
fallback. (Today it's `request → tariff → 'AED'`.)

---

## 4. Rate-engine changes (`rate-engine.mjs`)

The engine gains one new argument: `computeQuote(request, tariffData, company)`.
`company` is optional; when omitted the tariff's own values are used, so existing
callers and tests keep working during migration.

### 4.1 Base-currency-neutral FX  *(highest-risk change — do behind tests first)*

- Delete `DEFAULT_FX_TO_AED`. Introduce `baseCurrency` (from `company.base_currency`
  or `tariffData.contract.currency`).
- `fx` map is redefined as **`{ CUR: units_of_CUR_per_1_base }`** with the base
  currency implicitly `1`. (Same shape the seed already uses — it just stops
  meaning "per AED" and starts meaning "per base".)
- `convert(amount, from, to, fx, baseCurrency)`:
  `base = amount / rate(from)` then `return base * rate(to)`, where
  `rate(base) === 1`. Comment "via AED" → "via base currency".
- Every `convert(...)` call site (lines ~233, 245, 265) passes `baseCurrency`.
- Fallback `'AED'` string literals (lines 160, 180) → `baseCurrency`.

### 4.2 Data-driven accessorial predicates

Replace the four UAE-specific keys in `PREDICATES` (`rate-engine.mjs:112-116`)
with a generic rule form. `appliesWhen` becomes **either** a known universal key
**or** an object:

```jsonc
"appliesWhen": { "field": "origin", "op": "matches", "value": "(?i)saif" }
// fields: origin | destination | mode | loadType | option:<name> | pickupZone
// ops:    matches (regex) | equals | notEquals | in | isTrue | gt
```

Keep the universal keys as-is: `always`, `land_only`, `ltl_only`, `sea_only`,
`air_only`, `if_dangerous_goods`, `if_insure`, `if_palletize`,
`if_origin_dutypaid`, `if_sea_docs_not_received`, `manual`.

The UAE seed's BOE rules move from `if_origin_saif` etc. to
`{ field:"origin", op:"matches", value:"(?i)saif" }` — same behaviour, no place
name in the engine.

### 4.3 Field renames

| Old | New | Files |
|---|---|---|
| `options.cargoValueAed` | `options.cargoValue` | `rate-engine.mjs:126`, `public/app.js:156`, tests. Accept the old name as an alias for one release. |
| accessorial/lane `emirate` | `zone` | `rate-engine.mjs:253-254`, `seed-tariff.mjs`. |
| `contract.vatPct` | `contract.taxRatePct` (+ engine reads `company.tax_rate_pct`, `tax_mode`) | `rate-engine.mjs:272`. Keep `vatPct` alias. |

### 4.4 Tax in the result

`result.tax = { label, pct, amount }` replacing the bare `vatPct` / `vat`
(keep the old keys as aliases). `tax_mode: "none"` ⇒ `pct: 0`, line hidden.

---

## 5. Screen-by-screen changes

### 5.1 First-run setup wizard  *(new `#view-setup`)*

Shown when `GET /api/company` returns `setup_complete: false`. Three short steps,
all skippable/editable later:

1. **Identity** — display name, legal name, logo upload, address, tax id, contact.
2. **Money & tax** — base currency, tax label + rate (or "no tax"), FX rows for
   any other currencies you quote in.
3. **Numbering & first tariff** — quote prefix/pad, validity days; then pick a
   starter tariff: *UAE outbound* · *EU road* · *US LTL* · *Start empty*.

Writes `company`, seeds the chosen tariff, sets `setup_complete = true`.

### 5.2 Top bar (`index.html:10-23`)

- Logo `<img>` = `company.logo` (fallback to the current SVG glyph).
- Title = `company.display_name` + " — Rate & Quotation".
- Subtitle unchanged (active tariff name · currency · territory).

### 5.3 New "Settings" tab (or fold into Tariffs)

Form bound to `PUT /api/company` — every field from §3. Plus an FX-table editor
(rows of `CUR → rate`) and a tariff manager (rename/add/delete tariffs &
carriers, currently API-only per `README`).

### 5.4 New-quote screen (`#view-quote`)

| Control | Change |
|---|---|
| **Tariff** select | unchanged |
| **Origin** (H5) | remove `value="Jebel Ali"`; datalist `<option>`s built in `app.js` from `distinct(tariff.lanes[].origin)`; default = the most common lane origin or empty |
| **Quote currency** (H2) | options = `Object.keys({ ...company.fx_rates, ...tariff.contract.fx })` incl. `base_currency`; default `base_currency` |
| **Apply VAT** (H3) | label = `Apply ${company.tax_label}`; whole checkbox hidden when `tax_mode === "none"` |
| **Cargo value (AED)** (H4) | label = `Cargo value (${quoteCurrency})`; id/request key → `cargoValue` |
| **Pickup emirate** (H6) | label "Pickup zone"; `<option>`s from `tariff.accessorials` where `code` starts `COLLECTION_` (distinct `zone`); the pickup-zone + truck row hidden entirely when the tariff defines no collection accessorials |
| **Pickup truck** | options from distinct `truckType` on the tariff's collection accessorials, not the fixed 3T/10T/40FT |
| result "chargeable" chips, breakdown, ledger | ledger "VAT (5%)" → `${tax.label} (${tax.pct}%)`, row hidden when `tax_mode==="none"` |

### 5.5 Printable / PDF quotation (`quote-doc.mjs`) — first-class deliverable

This is what the client actually sends their customer (browser → Print → Save as
PDF), so it must be **fully company-branded**, not just the on-screen panel. It
already exists and was restyled; generalization turns its fixed header into a
real letterhead driven entirely by the Company Profile — no code edit per client.

Top-to-bottom layout after generalization:

| Band | Content | Source |
|---|---|---|
| **Letterhead** | company logo (left) · legal name, address, `city, country`, `Tax ID: …`, `email · phone · website` (right) | `company.logo/legal_name/address/city/country/tax_id/email/phone/website` |
| **Document title** | "Freight Quotation" · ref `ACME-2026-0007` · issued date · valid-until date · status | ref from DB (`quote_prefix`/`quote_pad`), `default_validity_days` |
| **Parties** | Quote **from** (company short block) · **to** (customer/account name) | `company`, `quote.customer` |
| **Shipment** | mode · load type · origin → destination · incoterm · chargeable qty & basis | request / engine result |
| **Charge table** | line items: label, detail, qty×unit, original-currency amount, quote-currency amount | `result.lines[]` (already currency-converted) |
| **Ledger** | Subtotal · `{tax.label} ({tax.pct}%)` — **row hidden when `tax_mode:"none"`** · **Total** in quote currency | `result.tax`, `result.total` |
| **Notes & exclusions** | tariff notes + `company.quote_footer_notes` appended | `result.meta.notes` + `company` |
| **Payment** *(optional band)* | `bank_details` block; shown only when set | `company.bank_details` |
| **Fine print** | standing VATOS / duties-excluded paragraph (already present) | static |

Behaviour rules:
- No logo set → fall back to the current SVG glyph; no `bank_details` → omit the
  band; `tax_mode:"none"` → omit the tax row **and** show the relevant footer
  note (e.g. EU reverse-charge line from the tariff seed).
- Amounts use `result.tax.label` / `result.tax.pct` / `result.total`, never a
  literal "VAT" or "AED".
- Same route (`GET /api/quotes/:ref/print`), same "Print / Save as PDF" button;
  print CSS unchanged.
- White-label + currency/word guard tests (§8) run against this HTML exactly as
  they do against `index.html`.

Covered by the **Phase A** line item *"Quote letterhead: logo, from-block,
tax_id, bank details, footer notes"* (size **M**) plus the tax-label item.

### 5.6 Saved-quotes screen

`money(q.total, q.quote_currency || 'AED')` (H1) → fallback to
`company.base_currency`. No other change.

---

## 6. Example-tariff set

Three seed files under `app/src/seed/`, each exporting the same shape as today's
`defaultTariff`. Setup wizard installs one; `npm run reset-db -- --tariff=eu-road`
to switch.

### 6.1 `uae-outbound.mjs`  *(today's `seed-tariff.mjs`, moved & de-`emirate`d)*

AED base; fx USD, KWD, SAR. Land LTL kg-breaks to GCC; FTL by trailer type;
air/sea/customs quote-based; FSC 10%; BOE docs (now regex rules); zone collections
(Sharjah/Ajman/UAQ/RAK/Fujairah); tax "VAT" 5%; incoterm "FCA Jebel Ali".

### 6.2 `eu-road.mjs`  *(new)*

- **Base** EUR; fx GBP, CHF, PLN, SEK, NOK.
- **FTL** flat per country/region: DE, FR, NL, BE, PL, IT, ES, AT, CZ — by
  equipment `tautliner-13.6`, `reefer-13.6`, `mega-13.6`.
- **LTL / groupage** €/100 kg weight-breaks with a €-per-shipment minimum;
  ldm (loading-metre) note.
- **Accessorials**: ADR / dangerous goods (`if_dangerous_goods`), tail-lift
  (manual), inside/hand delivery (manual), customs clearance GB import/export
  post-Brexit (`{ field:"destination", op:"matches", value:"(?i)^gb|united kingdom" }`),
  T1 transit document (manual), ferry / Eurotunnel crossing (manual),
  waiting time €/hour after 2 h free (manual), fuel surcharge % (`ltl_only` +
  a manual toggle for FTL).
- **Tax**: `tax_label:"VAT"`, `tax_mode:"none"` by default with a footer note
  *"Intra-EU B2B: VAT reverse-charged under Art. 196 VAT Directive"* — company
  can switch to exclusive + domestic rate.
- Incoterm default "DAP".

### 6.3 `us-ltl.mjs`  *(new)*

- **Base** USD; single currency (empty fx table).
- **LTL** priced by **freight class** (NMFC 50–500) × weight-break rate table,
  with an "FAK" (freight-all-kinds) class override; dimensional rule note
  (194 in³/lb). Origin/destination by 3-digit ZIP zone.
- **FTL** flat per lane by `dryvan-53`, `reefer-53`, `flatbed-48`.
- **Accessorials**: fuel surcharge % (weekly index), liftgate pickup, liftgate
  delivery, residential pickup, residential delivery, inside delivery, limited
  access (school/church/military), detention $/hour after 2 h, driver-assist /
  lumper, reconsignment, redelivery, appointment/notify, single-shipment fee.
  Most `manual`; residential via `{ field:"option:residential", op:"isTrue" }`.
- **Tax**: `tax_mode:"none"` (sales tax generally not on interstate freight).
- Incoterm default "FOB Origin".

Each new seed needs ~4 golden-file tests (a class-based LTL calc, an FTL calc,
an accessorial stack, a cross-currency line for EU).

---

## 7. Data migration & backward compatibility

- `db.mjs` adds `CREATE TABLE IF NOT EXISTS company (...)` and, on an existing
  DB with no row, inserts a **defaults** row with `setup_complete = 0` (or `1`
  if a tariff already exists, pre-filling `base_currency` from that tariff so
  nothing breaks silently).
- `contracts.currency` stays; new writes use `company.base_currency`.
- Engine accepts legacy field names (`cargoValueAed`, `vatPct`, `emirate`,
  `if_origin_saif` …) as aliases for **one release**, emitting a `warnings[]`
  entry so tariff authors migrate.
- `npm run reset-db` unchanged; add `--tariff=<name>` to choose the seed.
- White-label guard tests stay; add: **"no served response contains a currency
  code other than `company.base_currency` unless that code is in the FX table"**
  and **"index.html contains no hard-coded `AED`/`VAT`/`emirate`"**.

---

## 8. Test plan

| Suite | Additions |
|---|---|
| `rate-engine.test.mjs` | rename `cargoValueAed`→`cargoValue`; new: EUR-base cross-currency line; `tax_mode:"none"` hides tax; data-driven `appliesWhen` object matches origin regex; base-neutral `convert()` round-trips for a non-AED base. |
| new `seed/*.test.mjs` | golden-file calcs per §6 (UAE unchanged numbers must still pass). |
| `e2e-server.test.mjs` | `GET/PUT /api/company` round-trip; setup-incomplete → `/` still serves; quote ref honours `quote_prefix`; print letterhead shows `legal_name`; existing white-label asserts unchanged + the two new currency/word guards. |

Definition of done: `node --test` green, and a manual run of each of the three
starter tariffs produces a correctly-branded, correctly-taxed quote + printable.

---

## 9. Effort estimate & sequencing

Sizes: **S** ≈ ≤2 h, **M** ≈ half-day, **L** ≈ 1–2 days. Solo, on the current
zero-dependency stack.

### Phase A — Company Profile (non-breaking)  · ~1 day
| Item | Size |
|---|---|
| `company` table + `getCompany`/`updateCompany` + migration/defaults row (§3, §7) | M |
| `GET`/`PUT /api/company` (§3) | S |
| Settings screen bound to it, incl. FX-table editor (§5.3) | M |
| Top-bar logo + display name (§5.2, H12) | S |
| Quote letterhead: logo, from-block, tax_id, bank details, footer notes (§5.5, H11) | M |
| Configurable tax label + `tax_mode:"none"` through engine result, UI ledger, quote doc (§4.4, H3) | M |
| Quote-ref prefix/pad from profile (§3, H13) | S |

### Phase B — De-region the quote form (mostly non-breaking)  · ~half day
| Item | Size |
|---|---|
| Quote-currency select from `company.fx ∪ tariff.fx` (§5.4, H2) | S |
| `cargoValueAed` → `cargoValue`, currency-aware label (§4.3, H4) | S |
| Origin default + datalist from tariff lanes (§5.4, H5) | S |
| "Pickup zone" rename, options from tariff, hide-when-absent (§5.4, H6, H8) | M |
| Saved-quotes currency fallback (§5.6, H1-partial) | S |

### Phase C — Region-neutral engine (breaking-ish, behind tests)  · ~1–1.5 days
| Item | Size |
|---|---|
| Base-currency-neutral FX + drop `DEFAULT_FX_TO_AED` + all call sites (§4.1, H1) | M |
| Data-driven `appliesWhen` rule objects + keep universal keys (§4.2, H7) | M |
| Legacy field aliases + deprecation warnings (§7) | S |
| Engine/e2e test additions (§8) | M |

### Phase D — Multi-region examples + onboarding  · ~2–3 days
| Item | Size |
|---|---|
| Move UAE seed to `seed/uae-outbound.mjs`, de-`emirate` (§6.1) | S |
| `seed/eu-road.mjs` + 4 golden tests (§6.2) | L |
| `seed/us-ltl.mjs` + freight-class table + 4 golden tests (§6.3) | L |
| `reset-db --tariff=<name>` + first-run setup wizard `#view-setup` (§5.1) | M |
| README rewrite + `docs/ONBOARDING.md` ("deploy for a client in 15 min") | M |

**Total: ~5–7 focused days.** Phases A and B are independently shippable and
deliver most of the client-facing value (branding + non-UAE currency/tax);
C and D make it genuinely region-agnostic and demo-ready everywhere.

---

## 10. Open decisions for you

1. **Settings home** — a dedicated "Settings" tab, or fold company config into
   the existing "Tariffs" screen? (Plan assumes a new tab.)
2. **Logo storage** — data URI in SQLite (simplest, ≤64 KB, no file serving) vs.
   a real uploaded file under `public/`. (Plan assumes data URI.)
3. **FX source** — manual FX table only (current), or add an optional
   `npm run fx:refresh` pulling ECB/exchangerate.host? (Plan keeps it manual;
   auto-refresh is a later add.)
4. **Ship all three example tariffs installed**, or only the one picked at setup?
   (Plan installs one; others available via `reset-db --tariff=`.)
5. **Legacy alias window** — one release, or drop `cargoValueAed` / `vatPct` /
   `emirate` immediately since there are no external tariff authors yet?
6. **Still zero-dependency?** Everything above fits `node:*` built-ins. Confirm
   you want to keep it that way rather than pulling in `decimal.js` now (money is
   still `round2` float — see `docs/IMPLEMENTATION-PLAN.md`).
