import test from 'node:test';
import assert from 'node:assert/strict';
import { chargeableWeight, pickRateBreak, computeQuote, round2, convert } from '../src/rate-engine.mjs';
import { defaultTariff } from '../src/seed-tariff.mjs';

const DATA = {
  contract: defaultTariff.contract,
  lanes: defaultTariff.lanes,
  accessorials: defaultTariff.accessorials,
};

// Local (White Eagle) lanes are now folded into the one combined tariff.
const WE = DATA;

test('chargeableWeight — air uses higher of gross vs volumetric (/6000)', () => {
  // 100x80x60 cm = 480000 cm³ -> /6000 = 80 kg volumetric; gross 50 -> chargeable 80
  const r = chargeableWeight({ mode: 'air', pieces: [{ lengthCm: 100, widthCm: 80, heightCm: 60, weightKg: 50, quantity: 1 }] });
  assert.equal(r.grossKg, 50);
  assert.equal(r.volumetricKg, 80);
  assert.equal(r.chargeable, 80);
  assert.equal(r.basis, 'volumetric weight');
});

test('chargeableWeight — land uses /4000 and the 1 CBM = 250 kg floor', () => {
  // 1 CBM box, 120 kg gross. /4000 => 250 kg. CBM*250 => 250 kg. chargeable 250
  const r = chargeableWeight({ mode: 'land', pieces: [{ lengthCm: 100, widthCm: 100, heightCm: 100, weightKg: 120, quantity: 1 }] });
  assert.equal(r.volumeCbm, 1);
  assert.equal(r.volumetricKg, 250);
  assert.equal(r.chargeable, 250);
});

test('chargeableWeight — sea returns revenue tons (W/M)', () => {
  const r = chargeableWeight({ mode: 'sea', grossWeightKg: 1500, volumeCbm: 3.2 });
  assert.equal(r.weightTons, 1.5);
  assert.equal(r.revenueTons, 3.2); // volume wins
});

test('pickRateBreak — selects the right band', () => {
  const breaks = [{ upTo: 500, rate: 1.5 }, { upTo: 2000, rate: 1.4 }, { upTo: null, rate: 1.2 }];
  assert.equal(pickRateBreak(breaks, 300).rate, 1.5);
  assert.equal(pickRateBreak(breaks, 1500).rate, 1.4);
  assert.equal(pickRateBreak(breaks, 9000).rate, 1.2);
});

test('LTL Riyadh 1500 kg — base 2100 + 10% FSC + BOE 175 + 5% VAT', () => {
  const q = computeQuote({
    mode: 'land', loadType: 'LTL', origin: 'Jebel Ali', destination: 'KSA - Riyadh',
    grossWeightKg: 1500, options: { applyVat: true },
  }, DATA);

  const base = q.lines.find(l => l.code === 'BASE');
  const fsc = q.lines.find(l => l.code === 'FSC');
  const boe = q.lines.find(l => l.code === 'BOE_JEBELALI_NONDUTY');

  assert.equal(base.amount, 2100);        // 1500 kg x 1.40/kg (1001-2000 band)
  assert.equal(fsc.amount, 210);          // 10% of base
  assert.equal(boe.amount, 175);          // non-duty-paid ex Jebel Ali
  assert.equal(q.subtotal, 2485);         // 2100 + 210 + 175
  assert.equal(q.vat, round2(2485 * 0.05));
  assert.equal(q.total, round2(2485 * 1.05));
});

test('LTL Bahrain 50 kg — minimum charge 200 applies', () => {
  const q = computeQuote({
    mode: 'land', loadType: 'LTL', origin: 'Jebel Ali', destination: 'Bahrain',
    grossWeightKg: 50, options: { applyVat: false },
  }, DATA);
  const base = q.lines.find(l => l.code === 'BASE');
  assert.equal(base.amount, 200);
  assert.equal(base.detail.includes('min charge'), true);
  assert.equal(q.vat, 0);
});

test('FTL RUH via Batha, reefer 13.6m — flat 6460, no FSC on FTL', () => {
  const q = computeQuote({
    mode: 'land', loadType: 'FTL', origin: 'Jebel Ali', destination: 'RUH via Batha',
    equipment: 'reefer-13.6', containers: 1, options: { applyVat: false },
  }, DATA);
  const base = q.lines.find(l => l.code === 'BASE');
  assert.equal(base.amount, 6460);
  assert.equal(q.lines.some(l => l.code === 'FSC'), false);
});

test('Air freight — quote-based lane prices from manual buyRate + markup', () => {
  const q = computeQuote({
    mode: 'air', loadType: 'GENERAL', destination: 'Air - any destination',
    grossWeightKg: 250, buyRate: 3000, markupType: 'percent', markupValue: 15,
    options: { applyVat: false },
  }, DATA);
  const base = q.lines.find(l => l.code === 'BASE');
  assert.equal(base.amount, 3450); // 3000 + 15%
});

test('Air freight — missing buyRate produces a warning, not a crash', () => {
  const q = computeQuote({
    mode: 'air', loadType: 'GENERAL', destination: 'Air - any destination', grossWeightKg: 100,
  }, DATA);
  assert.equal(q.warnings.length > 0, true);
  assert.equal(q.total, 0);
});

test('Insurance — 2.5% of declared cargo value', () => {
  const q = computeQuote({
    mode: 'land', loadType: 'LTL', destination: 'Qatar - Doha', origin: 'Jebel Ali',
    grossWeightKg: 800, options: { insure: true, cargoValueAed: 40000, applyVat: false },
  }, DATA);
  const ins = q.lines.find(l => l.code === 'INSURANCE');
  assert.equal(ins.amount, 1000); // 2.5% of 40,000
});

test('Dangerous goods handling — flat 225 when flagged', () => {
  const q = computeQuote({
    mode: 'land', loadType: 'LTL', destination: 'Kuwait', origin: 'Jebel Ali',
    grossWeightKg: 600, options: { dangerousGoods: true, applyVat: false },
  }, DATA);
  assert.equal(q.lines.find(l => l.code === 'DGR').amount, 225);
});

test('Collection charge — auto-applies for the chosen pickup zone + truck', () => {
  // no pickup zone/truck → no collection line
  const none = computeQuote({
    mode: 'land', loadType: 'LTL', destination: 'Bahrain', origin: 'Jebel Ali', grossWeightKg: 600,
    options: { applyVat: false },
  }, DATA);
  assert.equal(none.lines.some(l => l.code.startsWith('COLLECTION_')), false);

  // pickup zone + truck chosen → the matching collection is added automatically
  const withPickup = computeQuote({
    mode: 'land', loadType: 'LTL', destination: 'Bahrain', origin: 'Jebel Ali', grossWeightKg: 600,
    options: { applyVat: false, pickupEmirate: 'Fujairah', pickupTruckType: '10T' },
  }, DATA);
  assert.equal(withPickup.lines.find(l => l.code === 'COLLECTION_FUJAIRAH_10T').amount, 1000);
  // only the one matching row, not every Fujairah/10T combination
  assert.equal(withPickup.lines.filter(l => l.code.startsWith('COLLECTION_')).length, 1);
});

test('Oman LTL — statistical BOE AED 195 auto-applies at destination', () => {
  const q = computeQuote({
    mode: 'land', loadType: 'LTL', destination: 'Muscat - Oman', origin: 'Jebel Ali',
    grossWeightKg: 800, options: { applyVat: false },
  }, DATA);
  assert.equal(q.lines.find(l => l.code === 'BOE_OMAN_STATISTICAL').amount, 195);
  // not on a Bahrain lane
  const bah = computeQuote({
    mode: 'land', loadType: 'LTL', destination: 'Bahrain', origin: 'Jebel Ali',
    grossWeightKg: 800, options: { applyVat: false },
  }, DATA);
  assert.equal(bah.lines.some(l => l.code === 'BOE_OMAN_STATISTICAL'), false);
});

test('Kuwait LTL — DO + PWC (KWD) auto-apply, converted to AED', () => {
  const q = computeQuote({
    mode: 'land', loadType: 'LTL', destination: 'Kuwait', origin: 'Jebel Ali',
    grossWeightKg: 800, options: { applyVat: false },
  }, DATA);
  const doLine = q.lines.find(l => l.code === 'KUWAIT_DO');
  const pwc = q.lines.find(l => l.code === 'KUWAIT_PWC');
  assert.equal(doLine.currency, 'KWD');
  assert.equal(doLine.amount, round2(7 * 12.0));        // KWD 7 -> AED
  assert.equal(pwc.amount, round2(18.510 * 12.0));       // KWD 18.510 -> AED
});

test('Transit days from the service schedule are exposed on the result', () => {
  const q = computeQuote({
    mode: 'land', loadType: 'LTL', destination: 'KSA - Jeddah', origin: 'Jebel Ali',
    grossWeightKg: 500, options: { applyVat: false },
  }, DATA);
  assert.equal(q.meta.transitDays, 6);
});

test('White Eagle local — per-trip flat rate by truck size', () => {
  const q3 = computeQuote({
    mode: 'land', loadType: 'LOCAL', origin: 'Jebel Ali', destination: 'Dubai',
    equipment: '3T', containers: 1, options: { applyVat: true },
  }, WE);
  const base = q3.lines.find(l => l.code === 'BASE');
  assert.equal(base.amount, 275);                     // JA -> Dubai, 3 Ton
  assert.match(base.label, /Local haulage Jebel Ali → Dubai/);
  assert.equal(q3.total, round2(275 * 1.05));

  const q7x2 = computeQuote({
    mode: 'land', loadType: 'LOCAL', origin: 'DWC', destination: 'Dubai',
    equipment: '7-10T', containers: 2, options: { applyVat: false },
  }, WE);
  assert.equal(q7x2.lines.find(l => l.code === 'BASE').amount, 1100); // 550 x 2 trucks
});

test('White Eagle local — origin selects the right lane for a shared destination', () => {
  const fromJA = computeQuote({
    mode: 'land', loadType: 'LOCAL', origin: 'Jebel Ali', destination: 'Sharjah',
    equipment: '3T', containers: 1, options: { applyVat: false },
  }, WE);
  const fromDWC = computeQuote({
    mode: 'land', loadType: 'LOCAL', origin: 'DWC', destination: 'Sharjah',
    equipment: '3T', containers: 1, options: { applyVat: false },
  }, WE);
  assert.equal(fromJA.lines.find(l => l.code === 'BASE').amount, 350);
  assert.equal(fromDWC.lines.find(l => l.code === 'BASE').amount, 400);
});

test('White Eagle local — manual add-on charge (customs seal) applies when picked', () => {
  const q = computeQuote({
    mode: 'land', loadType: 'LOCAL', origin: 'Jebel Ali', destination: 'Ajman',
    equipment: '7-10T', containers: 1, selectedAccessorials: ['WE_CUSTOMS_SEAL'],
    options: { applyVat: false },
  }, WE);
  assert.equal(q.lines.find(l => l.code === 'WE_CUSTOMS_SEAL').amount, 100);
  assert.equal(q.subtotal, 850); // 750 base + 100 seal
});

test('Cross-border LTL prices from any UAE origin', () => {
  for (const origin of ['Jebel Ali', 'Dubai', 'Sharjah - SAIF Zone', 'DAFZA']) {
    const q = computeQuote({
      mode: 'land', loadType: 'LTL', origin, destination: 'KSA - Riyadh',
      grossWeightKg: 1500, options: { applyVat: false },
    }, DATA);
    const base = q.lines.find(l => l.code === 'BASE');
    assert.equal(base.amount, 2100, `base freight should price for origin "${origin}"`);
    assert.equal(q.meta.laneMatched, true);
  }
});

test('quote lines carry an auto / optional source tag', () => {
  const q = computeQuote({
    mode: 'land', loadType: 'LOCAL', origin: 'Jebel Ali', destination: 'Ajman',
    equipment: '7-10T', containers: 1, selectedAccessorials: ['WE_CUSTOMS_SEAL'],
    options: { applyVat: false, insure: true, cargoValueAed: 20000 },
  }, DATA);
  assert.equal(q.lines.find(l => l.code === 'WE_CUSTOMS_SEAL').source, 'optional');
  assert.equal(q.lines.find(l => l.code === 'INSURANCE').source, 'auto');
});

test('Currency conversion — USD accessorial shown in AED quote', () => {
  const q = computeQuote({
    mode: 'sea', loadType: 'LCL', destination: 'Sea LCL - any destination',
    grossWeightKg: 2000, volumeCbm: 5, buyRate: 1200,
    options: { originalDocsReceived: false, applyVat: false },
  }, DATA);
  const nr = q.lines.find(l => l.code === 'SEA_DOCS_DEPOSIT_NR');
  assert.equal(nr.currency, 'USD');
  assert.equal(nr.amount, round2(75 * 3.6725)); // -> AED
});

test('convert() round-trips via AED', () => {
  assert.equal(convert(100, 'USD', 'USD', {}), 100);
  assert.equal(convert(1, 'USD', 'AED', { USD: 3.6725 }), 3.67);
});

test('seed tariff — combined UAE land transport (Aramex cross-border + local)', () => {
  assert.equal(defaultTariff.carrier.name, 'Aramex Emirates LLC');
  assert.equal(defaultTariff.contract.customer, 'Modern Line Distribution LLC');
  const types = new Set(defaultTariff.lanes.map(l => l.loadType));
  assert.ok(types.has('LTL') && types.has('FTL') && types.has('LOCAL'));
});

// ---- Phase A: Company Profile & configurable tax --------------------------

const REQ_RIYADH = {
  mode: 'land', loadType: 'LTL', origin: 'Jebel Ali', destination: 'KSA - Riyadh',
  grossWeightKg: 1500, options: { applyVat: true },
};

test('Phase A — no company arg is byte-identical to before', () => {
  const a = computeQuote(REQ_RIYADH, DATA);
  const b = computeQuote(REQ_RIYADH, DATA, null);
  assert.deepEqual(a, b);
  assert.equal(a.vat, round2(2485 * 0.05));
  assert.equal(a.tax.amount, a.vat);
  assert.equal(a.tax.pct, a.vatPct);
  assert.equal(a.tax.label, 'VAT');
});

test('Phase A — company.tax_mode "none" zeroes the tax line', () => {
  const q = computeQuote(REQ_RIYADH, DATA, { tax_mode: 'none', tax_rate_pct: 5 });
  assert.equal(q.tax.pct, 0);
  assert.equal(q.tax.amount, 0);
  assert.equal(q.tax.mode, 'none');
  assert.equal(q.total, q.subtotal);
  assert.equal(q.vat, 0); // alias
});

test('Phase A — company tax label/rate used when the tariff has none', () => {
  const noTaxTariff = {
    ...DATA,
    contract: { ...DATA.contract, vatPct: undefined },
  };
  const q = computeQuote(REQ_RIYADH, noTaxTariff, {
    tax_label: 'GST', tax_rate_pct: 9, tax_mode: 'exclusive',
  });
  assert.equal(q.tax.label, 'GST');
  assert.equal(q.tax.pct, 9);
  assert.equal(q.tax.amount, round2(q.subtotal * 0.09));
});

test('Phase A — tariff vatPct wins over company.tax_rate_pct', () => {
  const q = computeQuote(REQ_RIYADH, DATA, { tax_rate_pct: 20 });
  assert.equal(q.tax.pct, 5); // from defaultTariff.contract.vatPct
});

test('Phase A — company supplies incoterm & validity fallbacks', () => {
  const bare = { ...DATA, contract: { ...DATA.contract, incoterm: undefined, validityDays: undefined } };
  const q = computeQuote(REQ_RIYADH, bare, {
    default_incoterm: 'DAP', default_validity_days: 30, quote_footer_notes: ['ex works note'],
  });
  assert.equal(q.meta.incoterm, 'DAP');
  assert.equal(q.meta.footerNotes[0], 'ex works note');
});
