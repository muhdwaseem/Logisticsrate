# Implementation plan — starter → production RMS/quotation product

Goal: a rate-management & quotation product a logistics SME pays for. This repo
delivers **Phase 0**. Each later phase upgrades one layer without rewriting the
domain logic in `rate-engine.mjs`.

---

## Phase 0 — Domain starter  ✅ DONE (this repo)

- [x] Model a worked sample tariff as a structured rate card (`seed-tariff.mjs`).
- [x] Pure rate engine: chargeable weight (air/land/sea), LTL weight-break lookup,
      FTL flat lookup, quote-based lanes, rule-driven accessorials, markup, FX, VAT.
- [x] 14 unit tests (`node --test`), all green.
- [x] Zero-dependency API + SQLite persistence (`node:http`, `node:sqlite`).
- [x] Single-page UI: quote builder with live breakdown, saved-quotes pipeline,
      rate-card viewer + JSON editor.
- [x] Printable quotation document.

**Outcome:** anyone can run `node server.mjs` and produce a correct, itemised
quote from the contract.

---

## Phase 1 — Productionise the platform (2–4 weeks)

Adopt the stack from `STACK-RESEARCH.md`.

- **Repo:** monorepo (pnpm workspaces / Turborepo): `packages/rate-engine`
  (port `rate-engine.mjs` to TS + **decimal.js**, keep tests), `apps/api`
  (NestJS/Fastify), `apps/web` (React + Vite + shadcn/ui).
- **DB:** PostgreSQL + Prisma. Tables: `carriers`, `contracts`,
  `rate_sheets(valid_from, valid_to)`, `lanes`, `rate_breaks`, `accessorials`,
  `fx_rates`, `quotes`, `quote_lines`, `orgs`, `users`. Money = `numeric(14,4)`.
- **Migrate the seed:** a one-off script loads `seed-tariff.mjs` into Postgres.
- **Rate versioning:** never mutate a rate row; supersede with a new
  `valid_from`. Quotes store the full computed result JSON (immutable once sent).
- **Auth & tenancy:** Auth.js/Clerk; `org` scoping on every query; roles
  (admin / pricing / sales / viewer).
- **CI:** GitHub Actions — typecheck, engine tests, Playwright smoke, deploy.
- **Deploy:** container on Fly.io/Render + managed Postgres; nightly DB backup.

**Exit criteria:** multi-user, multi-contract, rate history, one-command deploy.

---

## Phase 2 — Rate ingestion & management UX (3–5 weeks)

The bottleneck for an SME is *getting rates in and keeping them current*.

- **Spreadsheet import:** upload an Excel/CSV rate sheet → column-mapping wizard →
  preview diff vs current → publish with `valid_from`. (BullMQ job.)
- **PDF contract assist:** OCR + LLM extraction to pre-fill a rate sheet from a
  carrier contract PDF, human-reviewed before publish.
- **Rate editor UI:** proper grid editing for lanes/breaks/accessorials
  (replaces the raw JSON textarea), validation, bulk % adjustments, expiry alerts.
- **Surcharge rule builder:** condition → charge, without code (origin zone, DG,
  commodity, weight band, container type, customer).
- **Multi-currency & FX:** scheduled FX refresh; lock FX rate onto each quote.

**Exit criteria:** an ops person maintains all rates with no developer.

---

## Phase 3 — Quoting workflow & documents (2–4 weeks)

- **Customer & enquiry model:** quote belongs to a customer; enquiry → quote →
  (optional) booking. Customer-specific markup / net rates.
- **Multi-option quotes:** present air vs sea vs land side by side; transit time,
  validity, cost-to-serve, margin %.
- **Branded PDF:** company logo, T&Cs, e-signature/accept link, expiry.
- **Email-out:** send quote from the app; track opened / accepted.
- **Revisions:** versioned quote (v1, v2…), never overwrite a sent version.
- **Approvals:** margin below threshold routes to a manager.

**Exit criteria:** full quote lifecycle in-app with an audit trail.

---

## Phase 4 — Integrations & automation (ongoing)

- **Accounting/ERP export:** won quote → invoice draft in Zoho/QuickBooks/Xero/
  Dynamics/NetSuite.
- **Carrier rate feeds:** Freightos/WebCargo/cargo.one/airline & NVOCC APIs for
  live buy rates on quote-based lanes.
- **Email-to-quote:** parse inbound rate requests, draft a quote automatically.
- **Analytics:** win rate by lane/customer/quarter, margin leakage, quote
  turnaround, rate freshness.
- **Public rate/quote API** for the SME's own customers or portal.

---

## Cross-cutting, from day 1 of Phase 1

| Concern | Approach |
|---|---|
| Money | `decimal.js` / Postgres `numeric`. Round only at line level, documented rounding mode. |
| Correctness | Rate engine stays pure; every contract clause → a named test. Golden-file tests per real contract. |
| Rate integrity | `valid_from/valid_to`, no destructive edits, immutable sent quotes. |
| Auditability | `created_by`, `superseded_by`, event log on rates and quotes. |
| Config not code | Lanes, breaks, surcharges, FX, VAT, incoterms = data. |
| Observability | Structured logs, error tracking (Sentry), request tracing on the pricing path. |
| Security | Per-org isolation, least-privilege DB role, secrets in a vault, dependency scanning. |
| Testing | Engine unit tests + API contract tests + Playwright E2E on the quote flow. |

---

## Rough effort (solo dev)

| Phase | Calendar |
|---|---|
| 0 | done |
| 1 | 2–4 weeks |
| 2 | 3–5 weeks |
| 3 | 2–4 weeks |
| 4 | continuous |

A sellable MVP = **Phase 1 + Phase 2 + branded PDF from Phase 3** (~2–3 months).
