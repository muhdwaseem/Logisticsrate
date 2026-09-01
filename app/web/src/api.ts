// Typed client for the zero-dependency JSON API served by ../server.mjs.
// Every endpoint here mirrors a route in server.mjs; shapes come from
// rate-engine.mjs (quote result) and db.mjs (contract / quote rows).

export interface ContractSummary {
  id: number;
  name: string;
  carrier_id?: number;
  customer?: string | null;
  currency?: string | null;
  created_at?: string;
}

export interface Break {
  upTo: number | null;
  rate: number;
}

export interface Lane {
  mode: string;
  loadType: string;
  destination: string;
  minCharge?: number;
  breaks?: Break[];
  flatRates?: Record<string, number | null>;
  quoteBased?: boolean;
}

export interface Accessorial {
  code: string;
  label: string;
  basis?: string;
  rate?: number;
  currency?: string;
  mode?: string;
  appliesWhen?: string;
}

export interface ContractData {
  contract: {
    name?: string;
    currency?: string;
    territory?: string;
    vatPct?: number;
    [k: string]: unknown;
  };
  lanes: Lane[];
  accessorials: Accessorial[];
}

export interface Contract extends ContractSummary {
  data: ContractData;
}

export interface QuoteLine {
  label: string;
  detail?: string;
  amount: number;
  currency?: string;
  amountOriginal?: number;
  source?: 'auto' | 'optional';
}

export interface QuoteTax {
  label: string;
  pct: number;
  amount: number;
  mode: 'exclusive' | 'none';
}

export interface QuoteResult {
  quoteCurrency: string;
  chargeableKg?: number | null;
  chargeable?: { basis?: string; volumeCbm?: number };
  meta?: { laneMatched?: boolean; transitDays?: number | null };
  lines?: QuoteLine[];
  subtotal: number;
  tax?: QuoteTax;
  vat: number;
  vatPct?: number;
  total: number;
  warnings?: string[];
}

export interface Company {
  legal_name: string;
  display_name: string;
  logo: string;
  address: string;
  city: string;
  country: string;
  tax_id: string;
  email: string;
  phone: string;
  website: string;
  base_currency: string;
  fx_rates: Record<string, number>;
  tax_label: string;
  tax_rate_pct: number;
  tax_mode: 'exclusive' | 'none';
  default_incoterm: string;
  default_validity_days: number;
  quote_prefix: string;
  quote_pad: number;
  quote_footer_notes: string[];
  bank_details: string;
  setup_complete: boolean;
}

export interface SavedQuoteRow {
  ref: string;
  customer?: string | null;
  origin?: string;
  destination?: string;
  mode: string;
  load_type?: string;
  total: number;
  quote_currency?: string;
  status: 'draft' | 'sent' | 'won' | 'lost';
}

export type QuoteStatus = SavedQuoteRow['status'];

export interface PieceInput {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
  quantity: number;
}

export interface QuoteRequest {
  mode: string;
  loadType: string;
  origin: string;
  destination: string;
  equipment: string | null;
  containers: number;
  buyRate?: number;
  markupType?: string;
  markupValue: number;
  quoteCurrency: string;
  selectedAccessorials: string[];
  options: {
    applyVat: boolean;
    dangerousGoods: boolean;
    originDutyPaid: boolean;
    originalDocsReceived: boolean;
    insure: boolean;
    cargoValueAed: number;
    pickupEmirate?: string;
    pickupTruckType?: string;
  };
  pieces?: PieceInput[];
  grossWeightKg?: number;
  volumeCbm?: number;
}

async function api<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'content-type': 'application/json' },
    ...opts,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || res.statusText);
  return body as T;
}

export const getCompany = () => api<Company>('/api/company');

export const putCompany = (patch: Partial<Company>) =>
  api<Company>('/api/company', { method: 'PUT', body: JSON.stringify(patch) });

export const getContracts = () => api<ContractSummary[]>('/api/contracts');

export const getContract = (id: number) => api<Contract>(`/api/contracts/${id}`);

export const putContractData = (id: number, data: ContractData) =>
  api<Contract>(`/api/contracts/${id}/data`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });

export const priceQuote = (contractId: number, request: QuoteRequest) =>
  api<QuoteResult>('/api/quote', {
    method: 'POST',
    body: JSON.stringify({ contractId, request }),
  });

export const saveQuote = (contractId: number, customer: string, request: QuoteRequest) =>
  api<{ ref: string; result: QuoteResult }>('/api/quotes', {
    method: 'POST',
    body: JSON.stringify({ contractId, customer, request }),
  });

export const getQuotes = () => api<SavedQuoteRow[]>('/api/quotes');

export const setQuoteStatus = (ref: string, status: QuoteStatus) =>
  api<unknown>(`/api/quotes/${ref}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });

export const money = (n: number | undefined, ccy: string) =>
  `${ccy} ${Number(n || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
