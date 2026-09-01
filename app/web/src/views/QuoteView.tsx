import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  money,
  priceQuote,
  saveQuote,
  type Company,
  type Contract,
  type Lane,
  type QuoteRequest,
  type QuoteResult,
} from '../api';
import { useToast } from '../components/Toast';

const LOAD_TYPES: Record<string, [string, string][]> = {
  land: [
    ['LTL', 'LTL — less than truck load'],
    ['FTL', 'FTL — full truck load'],
    ['LOCAL', 'Local — intra-UAE, per trip'],
  ],
  air: [['GENERAL', 'General cargo']],
  sea: [
    ['LCL', 'LCL — less than container'],
    ['FCL', 'FCL — full container'],
  ],
  customs: [['CLEARANCE', 'Customs clearance']],
};

// The forwarder quotes ex Jebel Ali or ex anywhere else in the UAE; both price
// the same cross-border export declaration. Free-zone-specific fees (SAIF /
// DAFZA) are keyed off the pickup-emirate field, not this one.
const ORIGIN_OPTIONS = ['Jebel Ali', 'UAE'];

interface PieceRow {
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  weightKg: string;
  quantity: string;
}

const emptyPiece = (): PieceRow => ({
  lengthCm: '',
  widthCm: '',
  heightCm: '',
  weightKg: '',
  quantity: '1',
});

interface FormState {
  mode: string;
  loadType: string;
  containers: string;
  origin: string;
  destination: string;
  equipment: string;
  buyRate: string;
  cargoMode: 'pieces' | 'summary';
  grossWeightKg: string;
  volumeCbm: string;
  markupType: string;
  markupValue: string;
  quoteCurrency: string;
  applyVat: boolean;
  dangerousGoods: boolean;
  originDutyPaid: boolean;
  originalDocsReceived: boolean;
  insure: boolean;
  cargoValueAed: string;
  pickupEmirate: string;
  pickupTruckType: string;
  customer: string;
}

const initialForm: FormState = {
  mode: 'land',
  loadType: '',
  containers: '1',
  origin: 'Jebel Ali',
  destination: '',
  equipment: '',
  buyRate: '',
  cargoMode: 'pieces',
  grossWeightKg: '',
  volumeCbm: '',
  markupType: 'percent',
  markupValue: '15',
  quoteCurrency: 'AED',
  applyVat: true,
  dangerousGoods: false,
  originDutyPaid: false,
  originalDocsReceived: true,
  insure: false,
  cargoValueAed: '',
  pickupEmirate: '',
  pickupTruckType: '',
  customer: '',
};

const num = (s: string) => Number(s) || 0;

interface Props {
  contractId: number | null;
  contract: Contract | null;
  company: Company | null;
}

export function QuoteView({ contractId, contract, company }: Props) {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(initialForm);
  const [pieces, setPieces] = useState<PieceRow[]>([emptyPiece()]);
  const [result, setResult] = useState<QuoteResult | null>(null);
  const [priceMsg, setPriceMsg] = useState('');
  const [live, setLive] = useState(false);
  const [savedRef, setSavedRef] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  type BoolKey = 'applyVat' | 'dangerousGoods' | 'originDutyPaid' | 'insure';
  const isLocal = form.loadType === 'LOCAL';
  const boolChecks: [BoolKey, string][] = [
    ['applyVat', `Apply ${company?.tax_label || 'VAT'}`],
    ['dangerousGoods', 'Dangerous goods'],
    // duty-paid origin only affects cross-border documentation
    ...(!isLocal ? [['originDutyPaid', 'Duty-paid origin'] as [BoolKey, string]] : []),
    ['insure', 'Insure cargo'],
  ];

  const lanes: Lane[] = useMemo(
    () => contract?.data?.lanes ?? [],
    [contract],
  );

  // ----- cascading option sets -----
  const loadTypeOptions = LOAD_TYPES[form.mode] ?? [];

  const destinationOptions = useMemo(() => {
    const matched = lanes.filter(
      (l) => l.mode === form.mode && (!form.loadType || l.loadType === form.loadType),
    );
    if (!matched.length) {
      return [{ value: '', label: '(no lane — quote-based)' }];
    }
    // one entry per destination; when several lanes share it (different origins)
    // the Origin field disambiguates in the engine.
    const seen = new Set<string>();
    return matched
      .filter((l) => !seen.has(l.destination) && seen.add(l.destination))
      .map((l) => ({ value: l.destination, label: l.destination }));
  }, [lanes, form.mode, form.loadType]);

  const currentLane = useMemo(
    () =>
      lanes.find(
        (l) =>
          l.mode === form.mode &&
          l.loadType === form.loadType &&
          l.destination === form.destination,
      ),
    [lanes, form.mode, form.loadType, form.destination],
  );

  const isFlat = !!currentLane?.flatRates;

  // Equipment carried on the lane but with no rate (null) — flatbed / low-bed —
  // is priced from a carrier buy rate the user types in.
  const equipRate = isFlat
    ? currentLane!.flatRates![form.equipment]
    : undefined;
  const equipQuoteBased =
    isFlat &&
    form.equipment in (currentLane!.flatRates ?? {}) &&
    (equipRate === null || equipRate === 0);

  const isQuoteBased =
    !currentLane ||
    currentLane.quoteBased === true ||
    (!currentLane.breaks && !currentLane.flatRates) ||
    equipQuoteBased;

  const equipmentOptions = useMemo(
    () => (isFlat ? Object.keys(currentLane!.flatRates!) : []),
    [isFlat, currentLane],
  );

  // ----- keep dependent selections valid when their option sets change -----
  useEffect(() => {
    const opts = LOAD_TYPES[form.mode] ?? [];
    setForm((f) =>
      opts.some(([v]) => v === f.loadType)
        ? f
        : { ...f, loadType: opts[0]?.[0] ?? '' },
    );
  }, [form.mode]);

  const destKey = destinationOptions.map((o) => o.value).join('|');
  useEffect(() => {
    setForm((f) =>
      destinationOptions.some((o) => o.value === f.destination)
        ? f
        : { ...f, destination: destinationOptions[0]?.value ?? '' },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destKey]);

  const equipKey = equipmentOptions.join('|');
  useEffect(() => {
    setForm((f) =>
      equipmentOptions.includes(f.equipment)
        ? f
        : { ...f, equipment: equipmentOptions[0] ?? '' },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipKey]);

  // ----- request assembly -----
  const request: QuoteRequest = useMemo(() => {
    const req: QuoteRequest = {
      mode: form.mode,
      loadType: form.loadType,
      origin: form.origin.trim(),
      destination: form.destination,
      equipment: isFlat ? form.equipment : null,
      containers: num(form.containers) || 1,
      buyRate: isQuoteBased ? num(form.buyRate) : undefined,
      markupType: form.markupType || undefined,
      markupValue: num(form.markupValue),
      quoteCurrency: form.quoteCurrency,
      selectedAccessorials: [],
      options: {
        applyVat: form.applyVat,
        dangerousGoods: form.dangerousGoods,
        originDutyPaid: form.originDutyPaid,
        originalDocsReceived: form.originalDocsReceived,
        insure: form.insure,
        cargoValueAed: num(form.cargoValueAed),
        pickupEmirate: form.pickupEmirate || undefined,
        pickupTruckType: form.pickupTruckType || undefined,
      },
    };
    if (form.cargoMode === 'pieces') {
      req.pieces = pieces
        .map((p) => ({
          lengthCm: num(p.lengthCm),
          widthCm: num(p.widthCm),
          heightCm: num(p.heightCm),
          weightKg: num(p.weightKg),
          quantity: num(p.quantity) || 1,
        }))
        .filter((p) => p.weightKg || p.lengthCm);
    } else {
      req.grossWeightKg = num(form.grossWeightKg);
      req.volumeCbm = num(form.volumeCbm);
    }
    return req;
  }, [form, pieces, isFlat, isQuoteBased]);

  const lastRequest = useRef(request);
  lastRequest.current = request;

  // ----- live pricing (debounced, race-guarded) -----
  const priceSeq = useRef(0);
  const runPrice = useCallback(
    async (req: QuoteRequest) => {
      if (contractId == null) return;
      const seq = ++priceSeq.current;
      try {
        const r = await priceQuote(contractId, req);
        if (seq !== priceSeq.current) return;
        setResult(r);
        setLive(true);
        setPriceMsg('');
        setSavedRef(null);
      } catch (err) {
        if (seq === priceSeq.current) {
          setPriceMsg('Not priced: ' + (err as Error).message);
        }
      }
    },
    [contractId],
  );

  const reqKey = useMemo(
    () => JSON.stringify({ contractId, request }),
    [contractId, request],
  );
  useEffect(() => {
    const t = setTimeout(() => runPrice(lastRequest.current), 300);
    return () => clearTimeout(t);
  }, [reqKey, runPrice]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    runPrice(lastRequest.current);
  };

  const onSave = async () => {
    if (contractId == null) return;
    try {
      const out = await saveQuote(
        contractId,
        form.customer.trim(),
        lastRequest.current,
      );
      setSavedRef(out.ref);
      toast('Quote ' + out.ref + ' saved');
    } catch (err) {
      toast('Save failed: ' + (err as Error).message, true);
    }
  };

  // ----- result view helpers -----
  const ccy = result?.quoteCurrency ?? form.quoteCurrency;
  const chips: { text: string; kind?: 'oklike' | 'warnlike' }[] = [];
  if (result && result.chargeableKg != null) {
    chips.push({
      text: `Chargeable ${result.chargeableKg} ${form.mode === 'sea' ? 'RT' : 'kg'}`,
    });
    if (result.chargeable?.basis) chips.push({ text: result.chargeable.basis });
    if (result.chargeable?.volumeCbm)
      chips.push({ text: `${result.chargeable.volumeCbm} CBM` });
    chips.push(
      result.meta?.laneMatched
        ? { text: 'lane matched', kind: 'oklike' }
        : { text: 'lane not matched', kind: 'warnlike' },
    );
    if (result.meta?.transitDays != null)
      chips.push({
        text: `Transit ~${result.meta.transitDays} day${result.meta.transitDays === 1 ? '' : 's'}`,
      });
  }

  return (
    <section className="view active">
      <div className="cols">
        <form className="card form" onSubmit={onSubmit}>
          <div className="card-head">
            <h2>Shipment</h2>
            <p className="card-sub">
              Describe the consignment — pricing updates as you type.
            </p>
          </div>

          <div className="fg">
            <div className="fg-head">
              <h3>Route &amp; service</h3>
            </div>

            <div className={isFlat ? 'row2' : ''}>
              <label className="field">
                Service type
                <select
                  value={form.loadType}
                  onChange={(e) => set('loadType', e.target.value)}
                >
                  {loadTypeOptions.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              {/* only per-truck lanes (FTL / LOCAL) need a count */}
              {isFlat && (
                <label className="field">
                  Trucks
                  <input
                    type="number"
                    min="1"
                    value={form.containers}
                    onChange={(e) => set('containers', e.target.value)}
                  />
                </label>
              )}
            </div>

            <div className="row2">
              <label className="field">
                Origin
                <select
                  value={form.origin}
                  onChange={(e) => set('origin', e.target.value)}
                >
                  {ORIGIN_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Destination
                <select
                  value={form.destination}
                  onChange={(e) => set('destination', e.target.value)}
                >
                  {destinationOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {isFlat && (
              <label className="field">
                Equipment
                <select
                  value={form.equipment}
                  onChange={(e) => set('equipment', e.target.value)}
                >
                  {equipmentOptions.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {isQuoteBased && (
              <label className="field">
                Carrier buy rate{isFlat ? ' (per truck)' : ''}
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 3200.00"
                  value={form.buyRate}
                  onChange={(e) => set('buyRate', e.target.value)}
                />
                <span className="hint">
                  {equipQuoteBased
                    ? `${form.equipment} isn’t on the rate schedule — enter the carrier’s quoted rate per truck.`
                    : 'This lane is quote-based — enter the rate the carrier quoted you.'}
                </span>
              </label>
            )}
          </div>

          <div className="fg">
            <div className="fg-head">
              <h3>Cargo</h3>
              <div className="seg" role="radiogroup" aria-label="Cargo entry mode">
                <label className="radio">
                  <input
                    type="radio"
                    name="cargoMode"
                    value="pieces"
                    checked={form.cargoMode === 'pieces'}
                    onChange={() => set('cargoMode', 'pieces')}
                  />{' '}
                  Piece list
                </label>
                <label className="radio">
                  <input
                    type="radio"
                    name="cargoMode"
                    value="summary"
                    checked={form.cargoMode === 'summary'}
                    onChange={() => set('cargoMode', 'summary')}
                  />{' '}
                  Totals only
                </label>
              </div>
            </div>

            {form.cargoMode === 'pieces' ? (
              <div>
                <div className="table-wrap">
                  <table className="pieces">
                    <thead>
                      <tr>
                        <th>L cm</th>
                        <th>W cm</th>
                        <th>H cm</th>
                        <th>Kg</th>
                        <th>Qty</th>
                        <th aria-label="remove" />
                      </tr>
                    </thead>
                    <tbody>
                      {pieces.map((p, i) => (
                        <tr key={i}>
                          {(
                            ['lengthCm', 'widthCm', 'heightCm', 'weightKg', 'quantity'] as const
                          ).map((field) => (
                            <td key={field}>
                              <input
                                type="number"
                                min={field === 'quantity' ? '1' : '0'}
                                step={
                                  field === 'weightKg'
                                    ? '0.01'
                                    : field === 'quantity'
                                      ? '1'
                                      : '0.1'
                                }
                                value={p[field]}
                                onChange={(e) =>
                                  setPieces((rows) =>
                                    rows.map((r, ri) =>
                                      ri === i ? { ...r, [field]: e.target.value } : r,
                                    ),
                                  )
                                }
                              />
                            </td>
                          ))}
                          <td>
                            <button
                              type="button"
                              className="rm"
                              title="remove"
                              onClick={() =>
                                setPieces((rows) =>
                                  rows.length > 1
                                    ? rows.filter((_, ri) => ri !== i)
                                    : rows,
                                )
                              }
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  className="link"
                  onClick={() => setPieces((rows) => [...rows, emptyPiece()])}
                >
                  + add piece
                </button>
              </div>
            ) : (
              <div className="row2">
                <label className="field">
                  Gross weight (kg)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.grossWeightKg}
                    onChange={(e) => set('grossWeightKg', e.target.value)}
                  />
                </label>
                <label className="field">
                  Volume (CBM)
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={form.volumeCbm}
                    onChange={(e) => set('volumeCbm', e.target.value)}
                  />
                </label>
              </div>
            )}

            {result?.meta?.suggestedTruck && (
              <p className="hint truck-hint">
                Suggested vehicle: <strong>{result.meta.suggestedTruck}</strong>{' '}
                — indicative, based on weight &amp; volume entered above.
              </p>
            )}
          </div>

          <div className="fg">
            <div className="fg-head">
              <h3>Pricing &amp; options</h3>
            </div>

            {/* Markup is fixed at 15% for now — applied silently, shown in the
                quote breakdown as "incl. markup 15%". */}
            <label className="field narrow">
              Quote currency
              <select
                value={form.quoteCurrency}
                onChange={(e) => set('quoteCurrency', e.target.value)}
              >
                <option>AED</option>
                <option>USD</option>
              </select>
            </label>

            <div className="checks">
              {boolChecks
                .filter(([key]) => key !== 'applyVat' || company?.tax_mode !== 'none')
                .map(([key, label]) => (
                  <label className="check" key={key}>
                    <input
                      type="checkbox"
                      checked={form[key]}
                      onChange={(e) => set(key, e.target.checked)}
                    />{' '}
                    {label}
                  </label>
                ))}
            </div>

            <div className="row3">
              <label className="field">
                Cargo value (AED)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.cargoValueAed}
                  onChange={(e) => set('cargoValueAed', e.target.value)}
                />
                <span className="hint">
                  Used for insurance and, on cross-border moves, a 5%
                  customs-duty estimate shown separately (not in the total).
                </span>
              </label>
              <label className="field">
                Pickup emirate
                <select
                  value={form.pickupEmirate}
                  onChange={(e) => set('pickupEmirate', e.target.value)}
                >
                  <option value="">—</option>
                  <option>Sharjah</option>
                  <option>Sharjah - Hamriya</option>
                  <option>Ajman</option>
                  <option>UAQ</option>
                  <option>RAK</option>
                  <option>Fujairah</option>
                </select>
              </label>
              <label className="field">
                Pickup truck
                <select
                  value={form.pickupTruckType}
                  onChange={(e) => set('pickupTruckType', e.target.value)}
                >
                  <option value="">—</option>
                  <option value="3T">3 Ton</option>
                  <option value="10T">10 Ton</option>
                  <option value="40FT">40ft trailer</option>
                </select>
              </label>
            </div>
          </div>

          <div className="fg">
            <div className="fg-head">
              <h3>Customer</h3>
            </div>
            <label className="field">
              Account
              <input
                placeholder="Consignor / account name"
                value={form.customer}
                onChange={(e) => set('customer', e.target.value)}
              />
            </label>
          </div>

          <div className="actions">
            <button type="submit" className="btn primary">
              Price it
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={!result}
              onClick={onSave}
            >
              Save quote
            </button>
            <span className="msg">{priceMsg}</span>
          </div>
        </form>

        <aside className="card result" aria-live="polite">
          <div className="card-head">
            <h2>
              Quotation {live && <span className="live-dot">live</span>}
            </h2>
            <p className="card-sub">Itemised buy + sell, ready to send.</p>
          </div>

          {!result ? (
            <div className="empty">
              <div className="empty-mark" aria-hidden="true">
                ₸
              </div>
              <p>
                Fill in the shipment on the left.
                <br />
                The priced quotation appears here.
              </p>
            </div>
          ) : (
            <div>
              <div className="chargeable">
                {chips.map((c, i) => (
                  <span
                    key={i}
                    className={`chip${c.kind ? ' ' + c.kind : ''}`}
                  >
                    {c.text}
                  </span>
                ))}
              </div>

              <div className="table-wrap">
                <table className="breakdown">
                  <thead>
                    <tr>
                      <th>Charge</th>
                      <th>Detail</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(result.lines ?? [])
                      .filter((l) => !l.informational)
                      .map((l, i) => (
                      <tr key={i}>
                        <td>
                          {l.label}
                          {l.source === 'optional' && (
                            <span className="tag-opt">optional</span>
                          )}
                        </td>
                        <td className="ln-detail">
                          {l.detail || ''}
                          {l.currency && l.currency !== ccy
                            ? ` · ${l.currency} ${Number(
                                l.amountOriginal,
                              ).toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                              })}`
                            : ''}
                        </td>
                        <td className="num">{money(l.amount, ccy)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2} className="num">
                        Subtotal
                      </td>
                      <td className="num">{money(result.subtotal, ccy)}</td>
                    </tr>
                    {result.tax?.mode !== 'none' && (
                      <tr>
                        <td colSpan={2} className="num">
                          {result.tax?.label ?? 'VAT'} (
                          {result.tax?.pct ?? result.vatPct ?? 0}%)
                        </td>
                        <td className="num">
                          {money(result.tax?.amount ?? result.vat, ccy)}
                        </td>
                      </tr>
                    )}
                    <tr className="total">
                      <td colSpan={2} className="num">
                        Total
                      </td>
                      <td className="num">{money(result.total, ccy)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {(result.lines ?? [])
                .filter((l) => l.informational)
                .map((l, i) => (
                  <div className="est-note" key={i}>
                    <span>
                      {l.label}
                    </span>
                    <strong>{money(l.amount, ccy)}</strong>
                  </div>
                ))}

              {result.warnings && result.warnings.length > 0 && (
                <div className="warn">
                  <strong>Check:</strong>
                  <ul>
                    {result.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {savedRef && (
                <div className="saved-info">
                  Saved as <strong>{savedRef}</strong> —{' '}
                  <a
                    href={`/api/quotes/${savedRef}/print`}
                    target="_blank"
                    rel="noopener"
                  >
                    open printable quote →
                  </a>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
