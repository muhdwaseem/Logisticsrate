/**
 * Freight Rate Engine — pure, framework-free.
 *
 * Turns a quote request + a contract's rate card into a fully itemised,
 * priced quotation. No I/O, no DB, no side effects: everything here is a
 * pure function so it can be unit-tested and reused from any transport
 * (HTTP API, CLI, batch import, a spreadsheet macro...).
 *
 * Money: computed in floating point and rounded to 2 dp per line with
 * `round2`. Good enough for quoting; a production build should swap this
 * for an integer-minor-unit or decimal library (see docs/IMPLEMENTATION-PLAN.md).
 */

export const DIM_FACTOR = { air: 6000, land: 4000 }; // cm³ per kg
export const CBM_TO_KG_LAND = 250;                   // 1 CBM = 250 kg (land)

/** Default FX to AED. Override per-contract via contractData.fx. */
export const DEFAULT_FX_TO_AED = { AED: 1, USD: 3.6725, KWD: 12.0 };

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

/**
 * Chargeable weight / volume.
 * pieces: [{ lengthCm, widthCm, heightCm, weightKg, quantity }]
 * grossWeightKg / volumeCbm: optional explicit overrides (used when no piece list)
 */
export function chargeableWeight({ mode, pieces = [], grossWeightKg = null, volumeCbm = null }) {
  const hasPieces = Array.isArray(pieces) && pieces.length > 0;

  const grossKg = hasPieces
    ? round2(sum(pieces.map(p => (Number(p.weightKg) || 0) * (Number(p.quantity) || 1))))
    : round2(Number(grossWeightKg) || 0);

  const cbm = hasPieces
    ? round2(sum(pieces.map(p =>
        ((Number(p.lengthCm) || 0) * (Number(p.widthCm) || 0) * (Number(p.heightCm) || 0) *
          (Number(p.quantity) || 1)) / 1_000_000)))
    : round2(Number(volumeCbm) || 0);

  if (mode === 'sea') {
    // Revenue tons: higher of volume (CBM) or weight (metric tonnes).
    const weightTons = grossKg / 1000;
    const revenueTons = Math.max(cbm, weightTons);
    return { grossKg, volumeCbm: cbm, weightTons: round2(weightTons), revenueTons: round2(revenueTons), chargeable: round2(revenueTons), basis: 'W/M (revenue ton)' };
  }

  const factor = DIM_FACTOR[mode] || DIM_FACTOR.air;
  let volumetricKg = hasPieces
    ? round2(sum(pieces.map(p =>
        ((Number(p.lengthCm) || 0) * (Number(p.widthCm) || 0) * (Number(p.heightCm) || 0) *
          (Number(p.quantity) || 1)) / factor)))
    : round2((Number(volumeCbm) || 0) * 1_000_000 / factor);

  if (mode === 'land') {
    // Contract also allows 1 CBM = 250 kg; charge the higher.
    volumetricKg = round2(Math.max(volumetricKg, cbm * CBM_TO_KG_LAND));
  }

  const chargeable = round2(Math.max(grossKg, volumetricKg));
  return {
    grossKg,
    volumeCbm: cbm,
    volumetricKg,
    chargeable,
    basis: chargeable === grossKg ? 'gross weight' : 'volumetric weight',
    dimFactor: factor,
  };
}

/** Pick the per-unit rate for a quantity from an ascending list of breaks.
 *  breaks: [{ upTo: number|null, rate: number }]  (null upTo = "and above") */
export function pickRateBreak(breaks, qty) {
  const sorted = [...breaks].sort((a, b) => {
    if (a.upTo === null) return 1;
    if (b.upTo === null) return -1;
    return a.upTo - b.upTo;
  });
  for (const b of sorted) {
    if (b.upTo === null || qty <= b.upTo) return b;
  }
  return sorted[sorted.length - 1];
}

function fxRate(fx, currency) {
  const table = { ...DEFAULT_FX_TO_AED, ...(fx || {}) };
  return table[currency] ?? 1;
}

/** Convert an amount in `from` currency to `to` currency via AED. */
export function convert(amount, from, to, fx) {
  const aed = Number(amount) * fxRate(fx, from);
  return round2(aed / fxRate(fx, to));
}

// ---- Accessorial applicability predicates -------------------------------------
// Seed data references these by key in `appliesWhen`.
const PREDICATES = {
  always: () => true,
  land_only: (r) => r.mode === 'land',
  ltl_only: (r) => r.mode === 'land' && (r.loadType === 'LTL' || !r.loadType),
  sea_only: (r) => r.mode === 'sea',
  air_only: (r) => r.mode === 'air',
  if_dangerous_goods: (r) => !!r.options?.dangerousGoods,
  if_insure: (r) => !!r.options?.insure && Number(r.options?.cargoValueAed) > 0,
  if_palletize: (r) => !!r.options?.palletize,
  if_pickup_other_emirate: (r) => !!r.options?.pickupEmirate && r.options.pickupEmirate !== 'Jebel Ali' && r.options.pickupEmirate !== 'Dubai' && r.options.pickupEmirate !== 'Sharjah',
  if_origin_saif: (r) => /saif/i.test(r.origin || ''),
  if_origin_dafza: (r) => /dafza/i.test(r.origin || ''),
  if_origin_dutypaid: (r) => !!r.options?.originDutyPaid,
  if_origin_jebelali_nonduty: (r) => /jebel\s*ali/i.test(r.origin || '') && !r.options?.originDutyPaid,
  if_sea_docs_not_received: (r) => r.mode === 'sea' && r.options?.originalDocsReceived === false,
  manual: (r, acc) => Array.isArray(r.selectedAccessorials) && r.selectedAccessorials.includes(acc.code),
};

/** Resolve the money amount for one accessorial line, in the accessorial's own currency. */
function accessorialAmount(acc, ctx) {
  const rate = Number(acc.rate) || 0;
  switch (acc.basis) {
    case 'percent_of_base':   return { qty: 1, unit: '%', amount: round2(ctx.baseSell * rate / 100) };
    case 'percent_of_value':  return { qty: 1, unit: '%', amount: round2((Number(ctx.request.options?.cargoValueAed) || 0) * rate / 100) };
    case 'per_kg':            return { qty: ctx.chargeableKg, unit: 'kg', amount: round2(ctx.chargeableKg * rate) };
    case 'per_container':     return { qty: ctx.containers, unit: 'cntr', amount: round2(ctx.containers * rate) };
    case 'per_shipment':      return { qty: 1, unit: 'shpt', amount: round2(rate) };
    case 'flat':              return { qty: 1, unit: 'flat', amount: round2(rate) };
    default:                  return { qty: 1, unit: 'flat', amount: round2(rate) };
  }
}

/**
 * Main entry point.
 *
 * request: {
 *   mode: 'air'|'sea'|'land',
 *   loadType: 'GENERAL'|'LCL'|'FCL'|'LTL'|'FTL',
 *   origin, destination, equipment,
 *   containers, pieces, grossWeightKg, volumeCbm,
 *   buyRate,                       // manual carrier base for quote-based lanes (air/sea/customs)
 *   markupType: 'percent'|'flat', markupValue,
 *   selectedAccessorials: [codes], // for basis-"manual" accessorials the user opts into
 *   options: { cargoValueAed, insure, dangerousGoods, originDutyPaid, palletize,
 *              customsClearance, originalDocsReceived, pickupEmirate, pickupTruckType, applyVat },
 *   quoteCurrency: 'AED'
 * }
 *
 * contractData: {
 *   contract: { name, currency, fscPct, vatPct, fx, incoterm, validityDays, notes },
 *   lanes:    [{ mode, loadType, origin, destination, equipment, currency, minChargeKg, minCharge, breaks:[{upTo,rate}], flatRates:{equip:rate} }],
 *   accessorials: [{ code, label, mode, basis, rate, currency, appliesWhen }]
 * }
 */
export function computeQuote(request, contractData) {
  const warnings = [];
  const { contract = {}, lanes = [], accessorials = [] } = contractData || {};
  const quoteCurrency = request.quoteCurrency || contract.currency || 'AED';
  const fx = contract.fx;

  // 1. Chargeable weight / volume
  const cw = chargeableWeight(request);
  const chargeableKg = request.mode === 'sea' ? (cw.grossKg || 0) : cw.chargeable;
  const containers = Number(request.containers) || 1;

  // 2. Locate the lane
  const norm = (s) => String(s || '').trim().toLowerCase();
  const lane = lanes.find(l =>
    norm(l.mode) === norm(request.mode) &&
    (!request.loadType || norm(l.loadType) === norm(request.loadType)) &&
    norm(l.destination) === norm(request.destination) &&
    (!l.origin || !request.origin || norm(l.origin) === norm(request.origin)));

  // 3. Base freight (carrier buy rate)
  let baseBuy = 0;
  let baseLabel = 'Base freight';
  let baseDetail = '';
  const laneCurrency = lane?.currency || contract.currency || 'AED';

  if (lane && Array.isArray(lane.breaks) && lane.breaks.length) {
    // Weight-break tariff (LTL / land)
    const minChargeKg = Number(lane.minChargeKg) || 0;
    const minCharge = Number(lane.minCharge) || 0;
    if (chargeableKg <= minChargeKg) {
      baseBuy = minCharge;
      baseDetail = `min charge (≤ ${minChargeKg} kg)`;
    } else {
      const brk = pickRateBreak(lane.breaks, chargeableKg);
      const raw = round2(chargeableKg * Number(brk.rate));
      baseBuy = Math.max(raw, minCharge);
      baseDetail = `${chargeableKg} kg × ${brk.rate}/kg` + (baseBuy === minCharge ? ` → raised to min ${minCharge}` : '');
    }
    baseLabel = `Land freight ${request.destination}`;
  } else if (lane && lane.flatRates) {
    // Flat per-equipment tariff (FTL / FCL)
    const key = request.equipment;
    const flat = Number(lane.flatRates[key]);
    if (!flat) {
      warnings.push(`No flat rate for equipment "${key}" on lane ${request.destination}. Options: ${Object.keys(lane.flatRates).join(', ')}`);
    } else {
      baseBuy = round2(flat * containers);
      baseDetail = `${containers} × ${flat} (${key})`;
    }
    baseLabel = `${request.loadType || 'FTL'} ${request.destination}`;
  } else {
    // Quote-based lane (air / sea / customs): forwarder keys the carrier buy rate
    baseBuy = Number(request.buyRate) || 0;
    baseDetail = 'manual carrier buy rate';
    baseLabel = `${request.mode === 'air' ? 'Air' : request.mode === 'sea' ? 'Sea' : 'Base'} freight ${request.destination || ''}`.trim();
    if (!baseBuy) warnings.push('Quote-based lane: enter a carrier buy rate ("buyRate") to price the base freight.');
  }

  // 4. Markup → sell base
  let markup = 0;
  if (request.markupType === 'percent') markup = round2(baseBuy * (Number(request.markupValue) || 0) / 100);
  else if (request.markupType === 'flat') markup = round2(Number(request.markupValue) || 0);
  const baseSell = round2(baseBuy + markup);

  // 5. Accessorials
  const ctx = { request, baseSell, baseBuy, chargeableKg, containers };
  const lines = [];

  // Base freight line (converted to quote currency)
  lines.push({
    code: 'BASE',
    label: baseLabel,
    detail: baseDetail,
    qty: request.mode === 'sea' ? cw.revenueTons : (lane?.breaks ? chargeableKg : containers),
    unit: request.mode === 'sea' ? 'RT' : (lane?.breaks ? 'kg' : 'unit'),
    currency: laneCurrency,
    amount: convert(baseSell, laneCurrency, quoteCurrency, fx),
    amountOriginal: baseSell,
  });
  if (markup) {
    lines[0].detail += ` | incl. markup ${request.markupType === 'percent' ? request.markupValue + '%' : request.markupValue}`;
  }

  // FSC from contract-level percent if not represented as an accessorial row
  const hasFscAccessorial = accessorials.some(a => a.code === 'FSC');
  const isLtl = request.mode === 'land' && (request.loadType === 'LTL' || !request.loadType);
  if (!hasFscAccessorial && Number(contract.fscPct) > 0 && isLtl) {
    const amt = round2(baseSell * Number(contract.fscPct) / 100);
    lines.push({ code: 'FSC', label: `Fuel surcharge (${contract.fscPct}%)`, detail: '% of base', qty: 1, unit: '%', currency: laneCurrency, amount: convert(amt, laneCurrency, quoteCurrency, fx), amountOriginal: amt });
  }

  for (const acc of accessorials) {
    if (acc.mode && acc.mode !== 'any' && acc.mode !== request.mode) continue;
    const pred = PREDICATES[acc.appliesWhen] || PREDICATES.manual;
    if (!pred(request, acc)) continue;
    // pickup-truck accessorials only when the matching truck type is chosen
    if (acc.code?.startsWith('COLLECTION_') && acc.truckType && acc.truckType !== request.options?.pickupTruckType) continue;
    if (acc.code?.startsWith('COLLECTION_') && acc.emirate && norm(acc.emirate) !== norm(request.options?.pickupEmirate)) continue;

    const { qty, unit, amount } = accessorialAmount(acc, ctx);
    if (!amount) continue;
    lines.push({
      code: acc.code,
      label: acc.label,
      detail: acc.basis.replace(/_/g, ' '),
      qty,
      unit,
      currency: acc.currency || laneCurrency,
      amount: convert(amount, acc.currency || laneCurrency, quoteCurrency, fx),
      amountOriginal: amount,
    });
  }

  // 6. Totals
  const subtotal = round2(sum(lines.map(l => l.amount)));
  const vatPct = request.options?.applyVat === false ? 0 : (Number(contract.vatPct) || 0);
  const vat = round2(subtotal * vatPct / 100);
  const total = round2(subtotal + vat);

  return {
    quoteCurrency,
    chargeable: cw,
    chargeableKg,
    lines,
    subtotal,
    vatPct,
    vat,
    total,
    warnings,
    meta: {
      contract: contract.name || null,
      incoterm: request.incoterm || contract.incoterm || 'EXW',
      validUntil: addDays(new Date(), Number(contract.validityDays) || 14).toISOString().slice(0, 10),
      laneMatched: !!lane,
      notes: contract.notes || [],
    },
  };
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
