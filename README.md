# Freight Rate & Quotation System

A rate-management and quotation engine that a logistics SME (freight forwarder,
NVOCC, transport company) can run to turn its **carrier tariffs** into **priced,
itemised customer quotations** in seconds, across air / sea / land, LCL/FCL/LTL/FTL,
with fuel, customs, insurance and collection surcharges applied by rule.

A worked sample tariff (`app/src/seed-tariff.mjs`) is loaded on first run, so the
system is usable immediately. Replace it with your own carrier agreements from the
**Tariffs** screen or `POST /api/contracts` — one record per agreement.

```
SoftwareforlogisticsSME/
├─ docs/
│  ├─ STACK-RESEARCH.md               which stack to build the real product on, and why
│  ├─ IMPLEMENTATION-PLAN.md          phased roadmap: this starter → production SaaS
│  └─ RATE-MODEL.md                   the tariff data model
├─ app/                               the working starter system (this repo)
│  ├─ server.mjs                      HTTP API + static host (node:http, no deps)
│  ├─ src/
│  │  ├─ rate-engine.mjs              pure pricing engine (chargeable weight, breaks, surcharges, VAT)
│  │  ├─ seed-tariff.mjs              the sample tariff as structured data
│  │  ├─ db.mjs                       persistence (node:sqlite, no deps)
│  │  └─ quote-doc.mjs                printable quotation document (HTML → PDF via browser)
│  ├─ public/                         single-page UI (vanilla JS, no build step)
│  └─ test/rate-engine.test.mjs       unit tests (node --test)
└─ data/freight.db                    created on first run
```

## Run it

Requires **Node.js ≥ 22.5** (uses the built-in `node:sqlite`). Nothing to `npm install`.

```bash
cd app
node server.mjs
# open http://localhost:4700
```

Other commands:

```bash
npm test          # run the rate-engine unit tests
npm run dev       # auto-restart on file changes
npm run reset-db  # wipe data/freight.db and re-seed
```

## What works today

| Area | Status |
|---|---|
| Chargeable weight — air (÷6000), land (÷4000 or 1 CBM = 250 kg), sea (W/M revenue ton) | ✅ |
| Land **LTL** weight-break tariff lookup + minimum charge | ✅ (8 sample lanes) |
| Land **FTL** flat rate by equipment type | ✅ (10 sample lanes, 3 equipment types) |
| Air / Sea / Customs — quote-based lanes priced from a keyed carrier buy-rate | ✅ |
| Surcharges: fuel (10%), BOE/customs docs by origin, DGR, insurance (2.5% of value), pickup uplift, container inspection, USD doc deposit | ✅ rule-driven |
| Forwarder markup (% or flat), multi-currency lines (AED/USD/KWD) with FX conversion | ✅ |
| UAE VAT 5% | ✅ toggle |
| Save quote → sequential ref (Q2026-0001) → printable PDF-ready document | ✅ |
| Quote pipeline status (draft / sent / won / lost) | ✅ |
| Tariff viewer + JSON editor (edit lanes/accessorials, pricing updates live) | ✅ |
| Add more carrier tariffs via `POST /api/contracts` | ✅ API only |

## What this starter deliberately is not

- No authentication / users / roles (single-tenant, single-user).
- `node:sqlite` is experimental and money is `round2`-float, not decimal — fine for
  quoting, not for invoicing/GL. See `docs/IMPLEMENTATION-PLAN.md` for the production path.
- No carrier API integrations, no email send, no accounting.

## API quick reference

```
GET  /api/health
GET  /api/contracts                 list tariffs
GET  /api/contracts/:id             full tariff (contract + lanes + accessorials)
POST /api/contracts                 { carrierName, name, customer, currency, data }
PUT  /api/contracts/:id/data        replace { contract, lanes[], accessorials[] }
POST /api/quote                     { contractId, request }  → priced result (not saved)
POST /api/quotes                    { contractId, customer, request } → { ref, result }
GET  /api/quotes                    list saved quotes
GET  /api/quotes/:ref               one saved quote
PATCH /api/quotes/:ref              { status: draft|sent|won|lost }
GET  /api/quotes/:ref/print         printable HTML quotation
```

See `docs/RATE-MODEL.md` for the shape of a `request`.
