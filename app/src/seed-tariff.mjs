/**
 * Aramex UAE land-transport tariff, as agreed with Modern Line Distribution LLC
 * (Services Agreement, commencement 11/10/2024). Air / sea / customs lanes are
 * quote-based per the agreement; LTL and FTL road rates are the contracted
 * schedule. The system ships seeded with this so it is usable on first start.
 */

// Provider identity — used to pre-fill the company profile on first run.
export const provider = {
  legal_name: 'Aramex Emirates LLC',
  display_name: 'Aramex',
  address: 'PO Box 1216\nBuilding and Warehouse No. 3, Um Ramool',
  city: 'Dubai',
  country: 'United Arab Emirates',
  email: 'DXBJALSALES@aramex.com',
  phone: '+971 600 544000',
  website: 'aramex.com',
  base_currency: 'AED',
  default_incoterm: 'FCA Jebel Ali',
  tax_label: 'VAT',
  tax_rate_pct: 5,
  quote_footer_notes: [
    'Air & Sea freight and Customs Clearance are quote-based: a fee quote is issued per shipment for written approval.',
    'This quotation is governed by the Aramex Services Agreement and its General Terms.',
  ],
};

export const defaultTariff = {
  carrier: {
    name: 'Aramex Emirates LLC',
    country: 'AE',
    contact: '+971 600 544000',
    email: 'DXBJALSALES@aramex.com',
  },
  contract: {
    name: 'Aramex — Modern Line Distribution (UAE Land Transport)',
    customer: 'Modern Line Distribution LLC',
    currency: 'AED',
    commencementDate: '2024-10-11',
    territory: 'United Arab Emirates',
    paymentTerms: '30 days from date of invoice',
    escalation: 'CPI or 5% (whichever, if no % inserted CPI applies)',
    fscPct: 10,            // fuel surcharge applied on land base rates
    vatPct: 5,             // UAE VAT
    incoterm: 'FCA Jebel Ali',
    validityDays: 14,
    fx: { AED: 1, USD: 3.6725, KWD: 12.0 },
    notes: [
      'Air & Sea freight and Customs Clearance are quote-based: a fee quote is issued per shipment for written approval.',
      'Air chargeable weight = higher of gross or volumetric (L×W×H cm / 6000).',
      'Land chargeable weight = higher of gross or volumetric (L×W×H cm / 4000, or 1 CBM = 250 kg).',
      'Sea LCL charged on higher of CBM or volumetric weight; FCL per container.',
      'Rates exclusive of taxes, customs duties, storage and regulatory charges.',
      'Airline / liner surcharges charged at cost, "Valid At Time Of Shipment" (VATOS).',
      'Insurance available at 2.5% of C&F invoice value, subject to T&C.',
      '5 free warehouse days at destination; storage per tariff thereafter.',
      'Demurrage AED 350/day to BAH/KWI/KSA after 48h at destination border (next day for Muscat).',
      'FTL cancellation AED 550 once truck booked for collection.',
    ],
  },

  lanes: [
    // ---- LAND · LTL (Less Truck Load) door-to-door, ex Dubai, AED/kg -----------
    // columns: min charge (≤100kg) | 101-500 | 501-1000 | 1001-2000 | 2001-3000 | 3001-4000 | 4001+
    ltl('Muscat - Oman', 150, [1.10, 1.05, 1.00, 0.95, 0.90, 0.90]),
    ltl('Kuwait',        200, [1.70, 1.40, 1.40, 1.30, 1.30, 1.20]),
    ltl('Amman - Jordan',300, [2.80, 2.55, 2.50, 2.45, 2.40, 2.30]),
    ltl('Bahrain',       200, [1.60, 1.30, 1.30, 1.20, 1.20, 1.10]),
    ltl('KSA - Dammam',  200, [1.40, 1.30, 1.30, 1.20, 1.20, 1.10]),
    ltl('KSA - Riyadh',  200, [1.50, 1.40, 1.40, 1.30, 1.30, 1.20]),
    ltl('KSA - Jeddah',  250, [1.70, 1.60, 1.60, 1.50, 1.50, 1.40]),
    ltl('Qatar - Doha',  200, [1.50, 1.40, 1.40, 1.30, 1.30, 1.20]),

    // ---- LAND · FTL (Full Truck Load) outbound Jebel Ali free zone, AED --------
    // equipment: closed box dry 13.6m | reefer 13.6m | closed box dry 15m
    ftl('BAH',            { 'closed-box-13.6': 6150, 'reefer-13.6': 7350, 'closed-box-15': 6700 }),
    ftl('DOH',            { 'closed-box-13.6': 4815, 'reefer-13.6': 6015, 'closed-box-15': 5365 }),
    ftl('KWI',            { 'closed-box-13.6': 6475, 'reefer-13.6': 7675, 'closed-box-15': 7025 }),
    ftl('DHA via Batha',  { 'closed-box-13.6': 4880, 'reefer-13.6': 6080, 'closed-box-15': 5430 }),
    ftl('RUH via Batha',  { 'closed-box-13.6': 5260, 'reefer-13.6': 6460, 'closed-box-15': 5810 }),
    ftl('JED via Batha',  { 'closed-box-13.6': 7210, 'reefer-13.6': 8410, 'closed-box-15': 7760 }),
    ftl('DHA via Kifa',   { 'closed-box-13.6': 6207, 'reefer-13.6': 7407, 'closed-box-15': 6757 }),
    ftl('RUH via Kifa',   { 'closed-box-13.6': 6707, 'reefer-13.6': 7907, 'closed-box-15': 7257 }),
    ftl('JED via Kifa',   { 'closed-box-13.6': 8707, 'reefer-13.6': 9907, 'closed-box-15': 9257 }),
    ftl('OMAN',           { 'closed-box-13.6': 3065, 'reefer-13.6': 4265 }),

    // ---- AIR · quote-based (rate keyed manually by forwarder) ------------------
    quoteLane('air', 'GENERAL', 'Air - any destination'),
    // ---- SEA · quote-based ----------------------------------------------------
    quoteLane('sea', 'LCL', 'Sea LCL - any destination'),
    quoteLane('sea', 'FCL', 'Sea FCL - any destination'),
    // ---- CUSTOMS CLEARANCE · quote-based ------------------------------------
    quoteLane('customs', 'CLEARANCE', 'Customs clearance'),
  ],

  accessorials: [
    // Fuel surcharge (land) — also derivable from contract.fscPct, kept explicit here.
    acc('FSC', 'Fuel surcharge (10%)', 'land', 'percent_of_base', 10, 'AED', 'ltl_only'),

    // Bill of Entry / documentation (origin-dependent, per shipment)
    acc('BOE_JEBELALI_NONDUTY', 'BOE + claim ack. — non-duty-paid ex Jebel Ali', 'any', 'per_shipment', 175, 'AED', 'if_origin_jebelali_nonduty'),
    acc('BOE_DUTYPAID',         'BOE — duty-paid shipment',                        'any', 'per_shipment', 195, 'AED', 'if_origin_dutypaid'),
    acc('BOE_SAIF',             'Export declaration — SAIF Zone',                  'any', 'per_shipment', 300, 'AED', 'if_origin_saif'),
    acc('BOE_DAFZA',            'Export declaration — DAFZA',                      'any', 'per_shipment', 325, 'AED', 'if_origin_dafza'),

    // Pickup / collection uplifts
    acc('PICKUP_OTHER_EMIRATE', 'LTL pickup ex other emirate / remote area (+AED 0.50/kg)', 'land', 'per_kg', 0.50, 'AED', 'manual'),
    collection('Sharjah',   '3T',  400), collection('Sharjah',   '10T', 650), collection('Sharjah',   '40FT', 800),
    collection('Ajman',     '3T',  400), collection('Ajman',     '10T', 700), collection('Ajman',     '40FT', 800),
    collection('UAQ',       '3T',  550), collection('UAQ',       '10T', 800), collection('UAQ',       '40FT', 900),
    collection('RAK',       '3T',  600), collection('RAK',       '10T', 900), collection('RAK',       '40FT', 1100),
    collection('Fujairah',  '3T',  600), collection('Fujairah',  '10T', 1000), collection('Fujairah', '40FT', 1200),

    // Handling
    acc('DGR', 'Dangerous goods handling', 'any', 'per_shipment', 225, 'AED', 'if_dangerous_goods'),
    acc('PALLETIZE', 'Palletisation (land, on request)', 'land', 'per_shipment', 0, 'AED', 'if_palletize'), // rate "additional charge" — forwarder sets

    // Insurance
    acc('INSURANCE', 'Cargo insurance (2.5% of C&F value)', 'any', 'percent_of_value', 2.5, 'AED', 'if_insure'),

    // Sea-specific
    acc('SEA_INSPECTION', 'Container inspection', 'sea', 'per_container', 300, 'AED', 'manual'),
    acc('SEA_DOCS_DEPOSIT_NR', 'Non-refundable doc service (orig. docs not received)', 'sea', 'per_shipment', 75, 'USD', 'if_sea_docs_not_received'),
    acc('IMCO_THC', 'IMCO / THC surcharge (DG sea)', 'sea', 'per_container', 0, 'AED', 'manual'),
  ],
};

// ---- builders ---------------------------------------------------------------
function ltl(destination, minCharge, perKgByBreak) {
  const [b500, b1000, b2000, b3000, b4000, bMax] = perKgByBreak;
  return {
    mode: 'land', loadType: 'LTL', origin: 'Jebel Ali', destination, equipment: null,
    currency: 'AED', minChargeKg: 100, minCharge,
    breaks: [
      { upTo: 500, rate: b500 },
      { upTo: 1000, rate: b1000 },
      { upTo: 2000, rate: b2000 },
      { upTo: 3000, rate: b3000 },
      { upTo: 4000, rate: b4000 },
      { upTo: null, rate: bMax },
    ],
  };
}

function ftl(destination, flatRates) {
  return { mode: 'land', loadType: 'FTL', origin: 'Jebel Ali', destination, currency: 'AED', flatRates };
}

function quoteLane(mode, loadType, destination) {
  return { mode, loadType, origin: null, destination, currency: 'AED', quoteBased: true };
}

function acc(code, label, mode, basis, rate, currency, appliesWhen) {
  return { code, label, mode, basis, rate, currency, appliesWhen };
}

function collection(emirate, truckType, rate) {
  return {
    code: `COLLECTION_${emirate.toUpperCase()}_${truckType}`,
    label: `Collection ${emirate} (${truckType.replace('FT', 'ft trailer').replace('T', ' Ton')})`,
    mode: 'land', basis: 'flat', rate, currency: 'AED',
    // auto-applies once a pickup zone + truck type are chosen; the engine's
    // zone/truckType guards then select the one matching row.
    appliesWhen: 'if_pickup_collection', emirate, truckType,
  };
}
