/** Printable quotation document (open in browser → Print → Save as PDF). */

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (n, ccy) => `${ccy} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function renderQuoteHtml(q, contract) {
  const r = q.result;
  const req = q.request;
  const ccy = r.quoteCurrency || 'AED';
  const carrier = contract?.carrier || contract?.data?.carrier?.name || '—';
  const contractName = contract?.name || r.meta?.contract || '—';

  const rows = (r.lines || []).map(l => `
    <tr>
      <td>${esc(l.label)}<div class="muted">${esc(l.detail || '')}</div></td>
      <td class="num">${esc(l.qty)} ${esc(l.unit || '')}</td>
      <td class="num">${l.currency && l.currency !== ccy ? esc(l.currency) + ' ' + Number(l.amountOriginal).toLocaleString('en-US', { minimumFractionDigits: 2 }) : ''}</td>
      <td class="num">${money(l.amount, ccy)}</td>
    </tr>`).join('');

  const notes = (r.meta?.notes || []).map(n => `<li>${esc(n)}</li>`).join('');
  const warns = (r.warnings || []).length
    ? `<div class="warn"><strong>Check:</strong><ul>${r.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>` : '';

  return `<!doctype html><html><head><meta charset="utf-8">
<title>Quotation ${esc(q.ref)}</title>
<style>
  :root { --ink:#1a1c1f; --muted:#6b7280; --line:#e5e7eb; --accent:#0b5cff; }
  * { box-sizing: border-box; }
  body { font: 14px/1.5 -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: var(--ink); margin: 0; padding: 40px; background: #fff; }
  .sheet { max-width: 820px; margin: 0 auto; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid var(--accent); padding-bottom: 16px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .ref { font-size: 15px; color: var(--accent); font-weight: 700; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 32px; margin: 24px 0; }
  .grid div { display: flex; justify-content: space-between; border-bottom: 1px dotted var(--line); padding: 4px 0; }
  .grid span:first-child { color: var(--muted); }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
  .num { text-align: right; white-space: nowrap; }
  .muted { color: var(--muted); font-size: 12px; }
  tfoot td { border: none; padding: 6px 8px; }
  tfoot .total td { border-top: 2px solid var(--ink); font-weight: 700; font-size: 16px; }
  .warn { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 10px 14px; margin-top: 16px; font-size: 13px; }
  footer { margin-top: 28px; font-size: 12px; color: var(--muted); }
  @media print { body { padding: 0; } .noprint { display: none; } }
  .btn { display:inline-block; margin: 16px 0; padding: 8px 16px; background: var(--accent); color:#fff; border-radius: 6px; text-decoration: none; }
</style></head>
<body><div class="sheet">
  <a class="btn noprint" href="javascript:print()">Print / Save as PDF</a>
  <header>
    <div>
      <h1>Freight Quotation</h1>
      <div class="ref">${esc(q.ref)}</div>
    </div>
    <div style="text-align:right">
      <div class="muted">Issued ${esc((q.created_at || '').slice(0, 10))}</div>
      <div class="muted">Valid until ${esc(r.meta?.validUntil || '—')}</div>
      <div class="muted">Status: ${esc(q.status || 'draft')}</div>
    </div>
  </header>

  <div class="grid">
    <div><span>Customer</span><span>${esc(q.customer || '—')}</span></div>
    <div><span>Carrier / contract</span><span>${esc(carrier)}</span></div>
    <div><span>Mode</span><span>${esc(req.mode)} · ${esc(req.loadType || '')}</span></div>
    <div><span>Incoterm</span><span>${esc(r.meta?.incoterm || 'EXW')}</span></div>
    <div><span>Origin</span><span>${esc(req.origin || '—')}</span></div>
    <div><span>Destination</span><span>${esc(req.destination || '—')}</span></div>
    <div><span>Chargeable</span><span>${esc(r.chargeableKg)} ${req.mode === 'sea' ? 'RT' : 'kg'} (${esc(r.chargeable?.basis || '')})</span></div>
    <div><span>Rate agreement</span><span>${esc(contractName)}</span></div>
  </div>

  <table>
    <thead><tr><th>Charge</th><th class="num">Basis</th><th class="num">Original</th><th class="num">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr><td colspan="3" class="num">Subtotal</td><td class="num">${money(r.subtotal, ccy)}</td></tr>
      <tr><td colspan="3" class="num">VAT (${esc(r.vatPct || 0)}%)</td><td class="num">${money(r.vat, ccy)}</td></tr>
      <tr class="total"><td colspan="3" class="num">Total</td><td class="num">${money(r.total, ccy)}</td></tr>
    </tfoot>
  </table>

  ${warns}

  <footer>
    <strong>Notes &amp; exclusions</strong>
    <ul>${notes || '<li>Standard carrier terms apply.</li>'}</ul>
    <p>Rates exclusive of customs duties, taxes, storage and regulatory charges unless line-itemed above.
    Carrier / airline / liner surcharges are charged at cost and valid at time of shipment (VATOS).</p>
  </footer>
</div></body></html>`;
}
