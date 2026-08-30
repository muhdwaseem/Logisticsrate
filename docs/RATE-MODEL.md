# Rate model — extracted from `Freight Agreement - Signed.pdf`

Parties: **Aramex Emirates LLC** (carrier) ⟷ **Modern Line Distribution LLC**
(customer). Commencement 11/10/2024. Territory UAE. Payment 30 days from invoice.
Service-fee escalation: CPI or 5%. Currency: AED (some charges USD / KWD).

The contract's **Appendix 2 – Rates Card** is the priceable content. Everything
below is transcribed into `app/src/seed-aramex.mjs`.

---

## 1. Chargeable quantity rules

| Mode | Rule (from contract) |
|---|---|
| **Air** | Higher of gross weight or volumetric = `L×W×H (cm) / 6000`. |
| **Land** | Higher of gross or volumetric = `L×W×H (cm) / 4000`, **or** `1 CBM = 250 kg`. Minimum chargeable 100 kg. |
| **Sea LCL** | Higher of CBM or volumetric weight (revenue ton, W/M). |
| **Sea FCL** | Per container. |

## 2. Land · LTL door-to-door (ex Dubai/Jebel Ali) — AED per kg

Rate depends on **destination** and a **weight break**. Columns:
min charge (≤100 kg) · 101–500 · 501–1000 · 1001–2000 · 2001–3000 · 3001–4000 · 4001+

| Destination | Min | ≤500 | ≤1000 | ≤2000 | ≤3000 | ≤4000 | 4000+ |
|---|--:|--:|--:|--:|--:|--:|--:|
| Muscat – Oman | 150 | 1.10 | 1.05 | 1.00 | 0.95 | 0.90 | 0.90 |
| Kuwait | 200 | 1.70 | 1.40 | 1.40 | 1.30 | 1.30 | 1.20 |
| Amman – Jordan | 300 | 2.80 | 2.55 | 2.50 | 2.45 | 2.40 | 2.30 |
| Bahrain | 200 | 1.60 | 1.30 | 1.30 | 1.20 | 1.20 | 1.10 |
| KSA – Dammam | 200 | 1.40 | 1.30 | 1.30 | 1.20 | 1.20 | 1.10 |
| KSA – Riyadh | 200 | 1.50 | 1.40 | 1.40 | 1.30 | 1.30 | 1.20 |
| KSA – Jeddah | 250 | 1.70 | 1.60 | 1.60 | 1.50 | 1.50 | 1.40 |
| Qatar – Doha | 200 | 1.50 | 1.40 | 1.40 | 1.30 | 1.30 | 1.20 |

Procedure (contract): select destination → chargeable weight (gross vs
volumetric) → multiply per-kg rate → add documentation (BOE) at origin.
`10% FSC` applies on these rates. Insurance 2.5% of C&F value (optional).
5 free warehouse days at destination.

## 3. Land · FTL (Full Truck Load) outbound Jebel Ali free zone — AED flat

| Destination | Closed box dry 13.6 m | Reefer 13.6 m | Closed box dry 15 m |
|---|--:|--:|--:|
| BAH | 6150 | 7350 | 6700 |
| DOH | 4815 | 6015 | 5365 |
| KWI | 6475 | 7675 | 7025 |
| DHA via Batha | 4880 | 6080 | 5430 |
| RUH via Batha | 5260 | 6460 | 5810 |
| JED via Batha | 7210 | 8410 | 7760 |
| DHA via Kifa | 6207 | 7407 | 6757 |
| RUH via Kifa | 6707 | 7907 | 7257 |
| JED via Kifa | 8707 | 9907 | 9257 |
| OMAN | 3065 | 4265 | — |

Notes: BOE AED 175. Demurrage AED 350/day to BAH/KWI/KSA after 48 h at border
(next day for Muscat). FTL cancellation AED 550 once truck booked. Branded/bonded
Aramex trucks only; non-branded may incur 3rd-party brokerage. Insurance excluded.

## 4. Accessorials / surcharges

| Code | Charge | Basis | Amount | Applies when |
|---|---|---|---|---|
| `FSC` | Fuel surcharge | % of base | 10% | Land LTL |
| `BOE_JEBELALI_NONDUTY` | BOE + claim ack. (non-duty-paid ex Jebel Ali) | per shipment | AED 175 | origin Jebel Ali, not duty-paid |
| `BOE_DUTYPAID` | BOE, duty-paid shipment / Oman statistical export | per shipment | AED 195 | duty-paid origin |
| `BOE_SAIF` | Export declaration — SAIF Zone | per shipment | AED 300 | origin SAIF Zone |
| `BOE_DAFZA` | Export declaration — DAFZA | per shipment | AED 325 | origin DAFZA |
| `PICKUP_OTHER_EMIRATE` | LTL pickup ex other emirate / remote | per kg | AED 0.50 (or higher) | manual |
| `COLLECTION_<emirate>_<truck>` | Northern-Emirates collection | flat | see table ↓ | manual (emirate + truck) |
| `DGR` | Dangerous goods handling | per shipment | AED 225 | DG flagged |
| `INSURANCE` | Cargo insurance | % of C&F value | 2.5% | opted, value entered |
| `SEA_INSPECTION` | Container inspection | per container | AED 300 | manual |
| `SEA_DOCS_DEPOSIT_NR` | Non-refundable doc service (orig. docs not received) | per shipment | USD 75 | sea, docs not received |
| `PALLETIZE` | Palletisation on request | per shipment | forwarder sets | manual |

### Northern-Emirates collection charges (AED)

| Area | 3 Ton | 10 Ton | 40 ft trailer |
|---|--:|--:|--:|
| Sharjah (BCL / SAIF) | 400 | 650 | 800 |
| Sharjah (Hamriya) | 450 | 800 | 1000 |
| Ajman | 400 | 700 | 800 |
| Umm Al Quwain | 550 | 800 | 900 |
| Ras Al Khaimah | 600 | 900 | 1100 |
| Fujairah | 600 | 1000 | 1200 |

_(Starter seeds Sharjah at the SAIF/BCL figures; Hamriya can be added as a variant.)_

### Kuwait LTL destination charges (informational — billed at official receipt)

Delivery order 7 KD/DO · PWC 18.510 KD/shipment · storage 0.30/50 kg/day after 4 days at NAS.

## 5. Quote-based scopes

**Air freight, Sea freight (LCL/FCL) and Customs Clearance** are *not* tariffed
in the contract — "Aramex shall send a fee quote to the Customer for written
approval in relation to each Shipment." The engine models these as **quote-based
lanes**: the forwarder keys the carrier's buy rate, and markup + rule-driven
surcharges + VAT are applied automatically.

## 6. Tax

UAE **VAT 5%** on the quotation subtotal (contract clause 6 — Tax Obligations).
Toggle per quote.

---

## Request shape (what the engine consumes)

```jsonc
{
  "mode": "land",                    // land | air | sea | customs
  "loadType": "LTL",                 // LTL | FTL | LCL | FCL | GENERAL | CLEARANCE
  "origin": "Jebel Ali",
  "destination": "KSA - Riyadh",     // must match a lane on the contract
  "equipment": "closed-box-13.6",    // FTL / FCL only
  "containers": 1,                   // FTL / FCL
  "pieces": [                        // OR grossWeightKg + volumeCbm
    { "lengthCm": 120, "widthCm": 100, "heightCm": 100, "weightKg": 800, "quantity": 2 }
  ],
  "buyRate": 3200,                   // quote-based lanes: carrier buy rate
  "markupType": "percent",           // percent | flat | (omit for none)
  "markupValue": 12,
  "quoteCurrency": "AED",            // AED | USD
  "selectedAccessorials": ["COLLECTION_FUJAIRAH_10T"],
  "options": {
    "applyVat": true,
    "dangerousGoods": false,
    "originDutyPaid": false,
    "originalDocsReceived": true,    // sea
    "insure": true, "cargoValueAed": 40000,
    "pickupEmirate": "Fujairah", "pickupTruckType": "10T"
  }
}
```

## Result shape

```jsonc
{
  "quoteCurrency": "AED",
  "chargeable": { "grossKg": 1600, "volumeCbm": 2.4, "volumetricKg": 600, "chargeable": 1600, "basis": "gross weight" },
  "chargeableKg": 1600,
  "lines": [
    { "code": "BASE", "label": "Land freight KSA - Riyadh", "detail": "1600 kg × 1.4/kg", "amount": 2240, "currency": "AED" },
    { "code": "FSC",  "label": "Fuel surcharge (10%)", "amount": 224 },
    { "code": "BOE_JEBELALI_NONDUTY", "label": "BOE + claim ack. …", "amount": 175 }
  ],
  "subtotal": 2639, "vatPct": 5, "vat": 131.95, "total": 2770.95,
  "warnings": [],
  "meta": { "incoterm": "FCA Jebel Ali", "validUntil": "2026-09-13", "laneMatched": true, "notes": [ … ] }
}
```
