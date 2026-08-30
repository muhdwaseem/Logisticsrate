# Which stack to build this on — research & recommendation

_Question: what is the best technology stack for a freight rate-management &
quotation product a logistics SME can actually use and you can maintain solo?_

## TL;DR

| Layer | Recommendation | Why |
|---|---|---|
| **Language** | **TypeScript everywhere** (Node.js 22 LTS) | One language across API, engine, UI. Huge logistics/EDI library ecosystem. Easy to hire for. |
| **Backend** | **NestJS** (or Fastify if you want lighter) | Structured, testable, DI — the rate engine deserves that rigor. OpenAPI out of the box. |
| **Rate engine** | Plain TS module + **decimal.js** (or big.js) | Pure functions, no framework. Money in decimal, never float. 100% unit-tested. This is the crown jewel — keep it isolated. |
| **Database** | **PostgreSQL** (managed: Supabase / Neon / RDS) | Relational rate tables, JSONB for irregular tariff shapes, strong constraints, `numeric` money type, row-level security if multi-tenant. |
| **ORM / migrations** | **Prisma** or **Drizzle** | Typed queries, versioned schema migrations. |
| **Frontend** | **React + Vite + TypeScript**, **TanStack Query**, **shadcn/ui + Tailwind** | Fast to build professional B2B UIs; component library gives you a credible look without a designer. |
| **PDF quotes** | **React-pdf** or **Puppeteer** HTML→PDF | Branded quotation / rate-confirmation documents. |
| **Auth** | **Auth.js** / **Clerk** / **Supabase Auth** | Don't build auth. Add org + role model on top. |
| **Hosting** | **Fly.io / Render / Railway** (container) + managed Postgres; or a single VPS with Docker Compose | Cheap, boring, scales far enough for an SME product. |
| **Background jobs** | **BullMQ + Redis** (rate-sheet imports, carrier rate refresh, quote expiry) | Needed once you ingest carrier tariffs in bulk. |

If you would rather ship one deployable unit: **Next.js (App Router) + Prisma +
Postgres + shadcn/ui**, with the rate engine still a standalone package in the
repo. Slightly less separation, much less ops.

### This starter's stack vs. the recommendation

This repo is built with **Node's built-ins only** (`node:http`, `node:sqlite`)
and vanilla JS — zero `npm install` — so it runs anywhere immediately and the
logic is easy to read. It is intentionally a *reference implementation of the
domain*, not the production architecture. The seam is clean: `rate-engine.mjs`
is already a pure module, and `db.mjs`'s exported functions are the only thing to
re-point at Postgres. Everything in the table above is a drop-in upgrade of one
layer at a time — see `IMPLEMENTATION-PLAN.md`.

## How the market builds this

From current (2025–2026) freight-tech landscape research:

- **Category:** what you're building is a **Rate Management System (RMS)** feeding
  a **quotation engine** — a slice of a TMS. Established players: CargoWise,
  GoFreight, Magaya, Descartes (enterprise); Freightos, Freightify, cargo.one,
  Quotiss, Wisor.ai, cargoON (rate distribution / instant quoting).
- **Common architecture:** a normalised **rate repository** (carrier × lane ×
  mode × validity × charge components), a **surcharge/accessorial rules layer**
  applied on top of base rates, a **markup/margin layer**, then a **quote
  document** with an expiry date. Modern tools add carrier-API rate feeds and
  email-to-quote automation; early adopters report **~75% faster quote turnaround**.
- **Pricing structure the engine must model** (industry-standard, and matches the
  Aramex contract):
  - **FCL / FTL** — flat rate per container / per truck by equipment type.
  - **LCL** — chargeable **W/M**: higher of volume (CBM) or weight (revenue ton).
  - **Air** — chargeable weight: higher of gross or volumetric (÷6000).
  - **Land LTL** — per-kg by weight break, with a minimum charge.
  - **Surcharges add ~15–30%** on top of base: fuel (BAF/CAF/FSC), THC, security,
    peak-season, customs/BOE, documentation, DGR, demurrage/detention, insurance.
  - Multi-currency (freight in USD, local charges in AED/KWD, etc.) with FX at
    time of quote.
- **Integration expectation:** an SME RMS is usually expected to export to /
  integrate with accounting or ERP (NetSuite, Dynamics, Zoho, Sage, QuickBooks).
  Design the quote object so it can become an invoice line set.

## Why not other stacks

- **Python + FastAPI + React** — excellent, and the rate engine reads beautifully
  in Python. Downside: two languages, two dependency worlds, more to hand off. Pick
  this only if the team is Python-first or you'll do heavy analytics/ML on rate data.
- **Rails / Laravel / Django monolith** — very productive, batteries included,
  great admin scaffolding for managing rate tables. Fine choice for a solo builder.
  TS wins on shared types between a rich calculator UI and the engine.
- **Go / Java** — overkill for SME scale; slower iteration.
- **Low-code (Retool, Budibase, Airtable)** — good for an internal MVP of the
  rate table + a quote form, bad once surcharge rules get conditional (they will).
  Usable as an admin panel bolted onto a real API.
- **Spreadsheets** — how most SMEs do this today; the thing you're replacing.

## Non-negotiables regardless of stack

1. **The rate engine is a pure, isolated, exhaustively-tested module.** No HTTP,
   no DB, no framework inside it. (Done here — `rate-engine.mjs` + 14 tests.)
2. **Money is decimal, not float**, from the first production commit.
3. **Rates are versioned** — every tariff row has `valid_from` / `valid_to`; you
   never mutate a rate that has priced a sent quote.
4. **A quote is immutable once sent** — store the computed result JSON, not just
   the inputs, so a rate change never silently alters a quote you gave a customer.
5. **Everything is data** — lanes, breaks, surcharges, FX, VAT are rows a
   non-developer ops person can edit, not code.

## Sources

- [4 best freight rate management software for 2026 — Guideflow](https://www.guideflow.com/blog/freight-rate-management-software)
- [Best Freight Software with Rate Management 2026 — GetApp](https://www.getapp.com/transportation-logistics-software/freight-management/f/rate-management/)
- [Best TMS Software 2026 — GoFreight](https://gofreight.com/blog/best-tms-software)
- [Best Freight Quoting Software 2026 — Wisor.ai](https://wisor.ai/best-freight-quoting-software/)
- [The 6 best TMS software for logistics companies in 2026 — Ubico](https://www.ubico.io/post/the-6-best-tms-software-for-logistics-companies-in-2026)
- [How to Calculate Ocean Freight Charges (FCL & LCL) — iContainers](https://www.icontainers.com/help/how-to-calculate-ocean-freight-charges/)
- [The Cost Drivers of LCL Rates — DHL Global Forwarding](https://www.dhl.com/us-en/home/global-forwarding/freight-forwarding-education-center/the-cost-drivers-of-lcl-rates.html)
- [Freight Forwarder Fees 2026: Full Breakdown — Suaid Global](https://suaidglobal.com/insights/freight-forwarding-cost/)
- [Ocean/Air Freight Software for Rates, Quotes & Booking — Freightos](https://www.freightos.com/forwarders/rate-quote/ocean/)
