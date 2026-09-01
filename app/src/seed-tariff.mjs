/**
 * Seeded UAE land-transport tariff — one combined rate card covering
 * cross-border LTL & FTL road freight and local intra-UAE per-trip haulage.
 * The load type (LTL / FTL / LOCAL) + destination selects which lanes apply.
 */

// Provider identity — pre-fills the company profile / letterhead on first run.
// Generic by default; edit it in Settings for the operating company.
export const provider = {
  legal_name: 'Freight & Trucking Quote',
  display_name: 'Freight & Trucking Quote',
  address: '',
  city: '',
  country: 'United Arab Emirates',
  email: '',
  phone: '',
  website: '',
  base_currency: 'AED',
  default_incoterm: 'FCA Jebel Ali',
  tax_label: 'VAT',
  tax_rate_pct: 5,
  quote_footer_notes: [
    'Rates in AED and exclusive of customs duties, taxes, storage and regulatory charges unless line-itemed above.',
    'Cross-border freight is governed by the carrier’s services agreement; local haulage by the carrier’s standard trading conditions.',
  ],
};

// ---- builders ---------------------------------------------------------------
function ltl(destination, minCharge, perKgByBreak, transitDays) {
  const [b500, b1000, b2000, b3000, b4000, bMax] = perKgByBreak;
  return {
    // origin null: the rate is valid for pick-up from any UAE point
    // (Jebel Ali / Dubai / Sharjah / free zones). Origin-specific export /
    // BOE declaration fees are added as accessorials.
    mode: 'land', loadType: 'LTL', origin: null, destination, equipment: null,
    currency: 'AED', minChargeKg: 100, minCharge, transitDays,
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

// Equipment that isn't on the signed rate schedule: offered on every FTL lane
// but priced per shipment — a null rate tells the engine to use the carrier
// buy rate the forwarder keys in.
const QUOTE_BASED_FTL_EQUIPMENT = { 'flatbed': null, 'low-bed': null };

function ftl(destination, flatRates, transitDays) {
  // origin null — valid for pick-up from any UAE point (see ltl()).
  return {
    mode: 'land', loadType: 'FTL', origin: null, destination, currency: 'AED',
    flatRates: { ...flatRates, ...QUOTE_BASED_FTL_EQUIPMENT },
    transitDays,
  };
}

function local(from, to, r3t, r7t) {
  return {
    mode: 'land', loadType: 'LOCAL', origin: from, destination: to,
    currency: 'AED', flatRates: { '3T': r3t, '7-10T': r7t },
  };
}

function quoteLane(mode, loadType, destination) {
  return { mode, loadType, origin: null, destination, currency: 'AED', quoteBased: true };
}

function acc(code, label, mode, basis, rate, currency, appliesWhen) {
  return { code, label, mode, basis, rate, currency, appliesWhen };
}

function collection(zone, truckType, rate) {
  return {
    code: `COLLECTION_${zone.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_${truckType}`,
    label: `Collection ${zone} (${truckType.replace('FT', 'ft trailer').replace('T', ' Ton')})`,
    mode: 'land', basis: 'flat', rate, currency: 'AED',
    // auto-applies once a pickup zone + truck type are chosen; the engine's
    // zone/truckType guards then select the one matching row.
    appliesWhen: 'if_pickup_collection', zone, truckType,
    emirate: zone, // back-compat: engine still reads `emirate`
  };
}

// ---- White Eagle local UAE lanes (per trip, flat by truck size) ------------
const whiteEagleLanes = [
  local('Jebel Ali', 'Jebel Ali',         125, 250),
  local('Jebel Ali', 'DWC',               175, 325),
  local('DWC',       'Al Quoz',            275, 450),
  local('Jebel Ali', 'Dubai',             275, 500),
  local('DWC',       'Dubai',             325, 550),
  local('Jebel Ali', 'DIC',               225, 400),
  local('Jebel Ali', 'DIP',               225, 400),
  local('Dubai',     'DIC',               300, 600),
  local('Jebel Ali', 'Sharjah',           350, 600),
  local('DWC',       'Sharjah',            400, 650),
  local('Jebel Ali', 'Sharjah SAIF Zone', 400, 700),
  local('Jebel Ali', 'Sharjah Sajja',     450, 750),
  local('Jebel Ali', 'Ajman',             450, 750),
  local('Jebel Ali', 'Hamriya FZE',       550, 850),
  local('Jebel Ali', 'RAK',               550, 800),
  local('Jebel Ali', 'Fujairah',          650, 900),
  local('Jebel Ali', 'Al Ain',            600, 950),
  local('Jebel Ali', 'Abu Dhabi',         500, 850),
  local('Jebel Ali', 'Ras Al Khor',       275, 450),
  local('Jebel Ali', 'UAQ',               500, 800),
  local('Jebel Ali', 'Khor Fakkan',       700, 900),
  local('Jebel Ali', 'Khalifa Port',      500, 800),
  local('Jebel Ali', 'Jazeera Port',      500, 850),
];

const whiteEagleAccessorials = [
  acc('WE_EXTRA_COLLECTION',   'Additional collection point on route',     'land', 'flat',          50,  'AED', 'manual'),
  acc('WE_WAIT_3T_HR',         'Waiting — 3 Ton (per hr after 1h free)',   'land', 'flat',          50,  'AED', 'manual'),
  acc('WE_WAIT_7T_HR',         'Waiting — 7/10 Ton (per hr after 1h free)','land', 'flat',          100, 'AED', 'manual'),
  acc('WE_WAIT_3T_DAY',        'Waiting — 3 Ton (full day)',               'land', 'flat',          200, 'AED', 'manual'),
  acc('WE_WAIT_7T_DAY',        'Waiting — 7/10 Ton (full day)',            'land', 'flat',          400, 'AED', 'manual'),
  acc('WE_CANCEL_3T',          'Trip cancellation — 3 Ton',                'land', 'per_shipment',  150, 'AED', 'manual'),
  acc('WE_CANCEL_7T',          'Trip cancellation — 7/10 Ton',             'land', 'per_shipment',  250, 'AED', 'manual'),
  acc('WE_DETENTION_3T',       'Overnight detention — 3 Ton',              'land', 'per_shipment',  250, 'AED', 'manual'),
  acc('WE_DETENTION_7T',       'Overnight detention — 7/10 Ton',           'land', 'per_shipment',  400, 'AED', 'manual'),
  acc('WE_CUSTOMS_SEAL',       'Customs-sealed shipment (per truck)',      'land', 'per_container', 100, 'AED', 'manual'),
  acc('WE_CUSTOMS_INSPECTION', 'Customs inspection (per truck)',           'land', 'per_container', 50,  'AED', 'manual'),
];

export const defaultTariff = {
  carrier: {
    name: 'UAE Road Freight Carrier',
    country: 'AE',
    contact: null,
    email: null,
  },
  contract: {
    name: 'UAE Land Transport — Cross-border & Local',
    customer: null,
    currency: 'AED',
    commencementDate: '2024-10-11',
    territory: 'United Arab Emirates',
    paymentTerms: '30 days from date of invoice',
    escalation: 'CPI or 5% (whichever, if no % inserted CPI applies)',
    fscPct: 10,            // 10% fuel surcharge on the LTL land base rates
    vatPct: 5,             // UAE VAT
    incoterm: 'FCA Jebel Ali',
    validityDays: 14,
    fx: { AED: 1, USD: 3.6725, KWD: 12.0 },
    notes: [
      'All land rates in AED. Cross-border rates valid for pick-up from Jebel Ali / Dubai / Sharjah, delivery to main cities at destination within city limits.',
      'Land chargeable weight = higher of gross or volumetric (L×W×H cm / 4000, or 1 CBM = 250 kg). LTL standard pallet 120×100×200 cm; odd sizes quoted on volume.',
      'LTL rates include a 10% fuel surcharge on the per-kg base; documentation (BOE) charges are added per shipment by origin.',
      'LTL pick-up from other Emirates / Dubai areas / remote areas: additional AED 0.50/kg or higher depending on area.',
      'FTL rates apply to branded / bonded trucks; non-branded trucks incur 3rd-party brokerage / in-transit fees at actual cost.',
      'KSA transit visa for BAH / KWI / DOH (in-transit immigration) is excluded; added at cost if reinstated.',
      'Local (intra-UAE) moves are priced per trip by truck size — 3 Ton or 7/10 Ton. Free 1 hour at each stuffing / destuffing site; waiting, split deliveries, cancellation and detention charged per the schedule. Tolls (Salik) not included.',
      'Insurance excluded — available at 2.5% of C&F invoice value, subject to T&C.',
      'Customs duties, taxes, clearance-related charges, warehouse storage and other surcharges are not included.',
      '5 free warehouse days at destination; storage per tariff thereafter.',
      'Demurrage AED 350/day to BAH / KWI / KSA after 48h at the destination border (next day for Muscat if not offloaded). Reefer demurrage case by case.',
      'FTL cross-border cancellation AED 550 once the truck is booked for collection.',
      'Air & Sea freight and Customs Clearance are quote-based: a fee quote is issued per shipment for written approval.',
    ],
  },

  lanes: [
    // ---- CROSS-BORDER · LTL (Less Truck Load) door-to-door, ex Dubai, AED/kg ---
    // ltl(destination, min charge ≤100kg, [101-500, 501-1000, 1001-2000, 2001-3000, 3001-4000, 4001+], transit days)
    ltl('Muscat - Oman',  150, [1.10, 1.05, 1.00, 0.95, 0.90, 0.90], 1),
    ltl('Kuwait',         200, [1.70, 1.40, 1.40, 1.30, 1.30, 1.20], 5),
    ltl('Amman - Jordan', 300, [2.80, 2.55, 2.50, 2.45, 2.40, 2.30], 7),
    ltl('Bahrain',        200, [1.60, 1.30, 1.30, 1.20, 1.20, 1.10], 4),
    ltl('KSA - Dammam',   200, [1.40, 1.30, 1.30, 1.20, 1.20, 1.10], 5),
    ltl('KSA - Riyadh',   200, [1.50, 1.40, 1.40, 1.30, 1.30, 1.20], 5),
    ltl('KSA - Jeddah',   250, [1.70, 1.60, 1.60, 1.50, 1.50, 1.40], 6),
    ltl('Qatar - Doha',   200, [1.50, 1.40, 1.40, 1.30, 1.30, 1.20], 4),

    // ---- CROSS-BORDER · FTL (Full Truck Load) outbound Jebel Ali free zone, AED
    // equipment: closed box dry 13.6m | reefer 13.6m | closed box dry 15m
    ftl('BAH',            { 'closed-box-13.6': 6150, 'reefer-13.6': 7350, 'closed-box-15': 6700 }, 4),
    ftl('DOH',            { 'closed-box-13.6': 4815, 'reefer-13.6': 6015, 'closed-box-15': 5365 }, 4),
    ftl('KWI',            { 'closed-box-13.6': 6475, 'reefer-13.6': 7675, 'closed-box-15': 7025 }, 5),
    ftl('DHA via Batha',  { 'closed-box-13.6': 4880, 'reefer-13.6': 6080, 'closed-box-15': 5430 }, 5),
    ftl('RUH via Batha',  { 'closed-box-13.6': 5260, 'reefer-13.6': 6460, 'closed-box-15': 5810 }, 5),
    ftl('JED via Batha',  { 'closed-box-13.6': 7210, 'reefer-13.6': 8410, 'closed-box-15': 7760 }, 6),
    ftl('DHA via Kifa',   { 'closed-box-13.6': 6207, 'reefer-13.6': 7407, 'closed-box-15': 6757 }, 5),
    ftl('RUH via Kifa',   { 'closed-box-13.6': 6707, 'reefer-13.6': 7907, 'closed-box-15': 7257 }, 5),
    ftl('JED via Kifa',   { 'closed-box-13.6': 8707, 'reefer-13.6': 9907, 'closed-box-15': 9257 }, 6),
    ftl('OMAN',           { 'closed-box-13.6': 3065, 'reefer-13.6': 4265 }, 1),

    // ---- LOCAL · intra-UAE per-trip haulage (White Eagle) --------------------
    ...whiteEagleLanes,

    // ---- AIR / SEA / CUSTOMS · quote-based ----------------------------------
    quoteLane('air', 'GENERAL', 'Air - any destination'),
    quoteLane('sea', 'LCL', 'Sea LCL - any destination'),
    quoteLane('sea', 'FCL', 'Sea FCL - any destination'),
    quoteLane('customs', 'CLEARANCE', 'Customs clearance'),
  ],

  accessorials: [
    // Fuel surcharge (LTL) — also derivable from contract.fscPct, kept explicit here.
    acc('FSC', 'Fuel surcharge (10%)', 'land', 'percent_of_base', 10, 'AED', 'ltl_only'),

    // Bill of Entry / documentation — origin-dependent, per shipment
    acc('BOE_NONDUTY', 'BOE + claim acknowledgment — non-duty-paid shipment', 'any', 'per_shipment', 175, 'AED', 'if_xborder_nonduty'),
    acc('BOE_DUTYPAID',         'BOE — duty-paid shipment',                        'any', 'per_shipment', 195, 'AED', 'if_origin_dutypaid'),
    acc('BOE_SAIF',             'Export declaration — SAIF Zone',                  'any', 'per_shipment', 300, 'AED', 'if_origin_saif'),
    acc('BOE_DAFZA',            'Export declaration — DAFZA',                      'any', 'per_shipment', 325, 'AED', 'if_origin_dafza'),
    acc('BOE_OMAN_STATISTICAL', 'Oman statistical BOE / export declaration',       'land', 'per_shipment', 195, 'AED', 'if_dest_oman'),

    // Kuwait (NAS) LTL destination charges — contract states amounts in KWD
    acc('KUWAIT_DO',  'Kuwait delivery order (NAS)',  'land', 'per_shipment', 7,      'KWD', 'if_dest_kuwait'),
    acc('KUWAIT_PWC', 'Kuwait PWC charges (NAS)',     'land', 'per_shipment', 18.510, 'KWD', 'if_dest_kuwait'),

    // Pickup / collection uplifts (cross-border LTL)
    acc('PICKUP_OTHER_EMIRATE', 'LTL pickup ex other emirate / remote area (+AED 0.50/kg)', 'land', 'per_kg', 0.50, 'AED', 'manual'),
    collection('Sharjah',          '3T', 400), collection('Sharjah',          '10T', 650), collection('Sharjah',          '40FT', 800),
    collection('Sharjah - Hamriya','3T', 450), collection('Sharjah - Hamriya','10T', 800), collection('Sharjah - Hamriya','40FT', 1000),
    collection('Ajman',            '3T', 400), collection('Ajman',            '10T', 700), collection('Ajman',            '40FT', 800),
    collection('UAQ',              '3T', 550), collection('UAQ',              '10T', 800), collection('UAQ',              '40FT', 900),
    collection('RAK',              '3T', 600), collection('RAK',              '10T', 900), collection('RAK',              '40FT', 1100),
    collection('Fujairah',         '3T', 600), collection('Fujairah',         '10T', 1000), collection('Fujairah',        '40FT', 1200),

    // Handling
    acc('DGR', 'Dangerous goods handling', 'any', 'per_shipment', 225, 'AED', 'if_dangerous_goods'),
    acc('PALLETIZE', 'Palletisation (land, on request)', 'land', 'per_shipment', 0, 'AED', 'if_palletize'),

    // Insurance
    acc('INSURANCE', 'Cargo insurance (2.5% of C&F value)', 'any', 'percent_of_value', 2.5, 'AED', 'if_insure'),

    // Local (intra-UAE) trip add-ons
    ...whiteEagleAccessorials,

    // Sea-specific
    acc('SEA_INSPECTION', 'Container inspection', 'sea', 'per_container', 300, 'AED', 'manual'),
    acc('SEA_DOCS_DEPOSIT_NR', 'Non-refundable doc service (orig. docs not received)', 'sea', 'per_shipment', 75, 'USD', 'if_sea_docs_not_received'),
    acc('IMCO_THC', 'IMCO / THC surcharge (DG sea)', 'sea', 'per_container', 0, 'AED', 'manual'),
  ],
};
