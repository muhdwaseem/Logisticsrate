/** Printable quotation document (open in browser → Print → Save as PDF).
 *
 * Fully driven by the Company Profile (docs/PHASE-A-COMPANY-PROFILE.md §4):
 * letterhead, from-identity, tax wording, footer notes and an optional payment
 * band all come from `company`. With no company it degrades to the previous
 * generic header, so old callers keep working. */

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nl2br = (s) => esc(s).replace(/\r?\n/g, '<br>');
const money = (n, ccy) => `${ccy} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function renderQuoteHtml(q, contract, company = null) {
  const r = q.result;
  const req = q.request;
  const co = company || {};
  const ccy = r.quoteCurrency || co.base_currency || 'AED';

  // tax — prefer the new result.tax, fall back to legacy vatPct/vat on old rows
  const tax = r.tax || { label: 'VAT', pct: Number(r.vatPct) || 0, amount: Number(r.vat) || 0, mode: 'exclusive' };
  const showTaxRow = (tax.mode || 'exclusive') !== 'none';

  const hasIdentity = !!(co.legal_name || co.display_name || co.logo || co.address || co.tax_id);

  const rows = (r.lines || []).map(l => `
    <tr>
      <td>${esc(l.label)}${l.detail ? `<div class="sub">${esc(l.detail)}</div>` : ''}</td>
      <td class="num">${esc(l.qty)} ${esc(l.unit || '')}</td>
      <td class="num">${l.currency && l.currency !== ccy ? esc(l.currency) + ' ' + Number(l.amountOriginal).toLocaleString('en-US', { minimumFractionDigits: 2 }) : ''}</td>
      <td class="num">${money(l.amount, ccy)}</td>
    </tr>`).join('');

  const noteItems = [...(r.meta?.notes || []), ...(r.meta?.footerNotes || [])];
  const notes = noteItems.map(n => `<li>${esc(n)}</li>`).join('');
  const warns = (r.warnings || []).length
    ? `<div class="warn"><strong>Check:</strong><ul>${r.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>` : '';

  const meta = [
    ['Customer', esc(q.customer || '—')],
    ['Mode', `${esc(req.mode)} · ${esc(req.loadType || '')}`],
    ['Origin', esc(req.origin || '—')],
    ['Destination', esc(req.destination || '—')],
    ['Incoterm', esc(r.meta?.incoterm || co.default_incoterm || 'EXW')],
    ['Chargeable', `${esc(r.chargeableKg)} ${req.mode === 'sea' ? 'RT' : 'kg'} (${esc(r.chargeable?.basis || '')})`],
    ...(r.meta?.transitDays != null
      ? [['Transit', `${esc(r.meta.transitDays)} day${r.meta.transitDays === 1 ? '' : 's'} (indicative)`]]
      : []),
  ].map(([k, v]) => `<div><span>${k}</span><span>${v}</span></div>`).join('');

  const logoHtml = co.logo
    ? `<img class="logo-img" src="${esc(co.logo)}" alt="">`
    : `<div class="glyph" aria-hidden="true">◈</div>`;

  const contactLine = [co.email, co.phone, co.website].filter(Boolean).map(esc).join(' &middot; ');
  const letterhead = `
    <div class="mark">
      ${logoHtml}
      ${hasIdentity && (co.legal_name || co.display_name)
        ? `<div class="co-name">${esc(co.legal_name || co.display_name)}</div>` : ''}
    </div>
    <div class="co-contact">
      ${co.address ? `<div>${nl2br(co.address)}</div>` : ''}
      ${(co.city || co.country) ? `<div>${esc([co.city, co.country].filter(Boolean).join(', '))}</div>` : ''}
      ${co.tax_id ? `<div>Tax ID: ${esc(co.tax_id)}</div>` : ''}
      ${contactLine ? `<div>${contactLine}</div>` : ''}
    </div>`;

  const payBlock = co.bank_details
    ? `<div class="pay"><strong>Payment</strong>${nl2br(co.bank_details)}</div>` : '';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Quotation ${esc(q.ref)}</title>
<style>
  :root { --ink:#172033; --soft:#46536a; --muted:#7b8598; --line:#e3e8ef; --accent:#2f56d9; }
  * { box-sizing: border-box; }
  body { font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         color: var(--ink); margin: 0; padding: 44px 40px; background: #fff; }
  .sheet { max-width: 820px; margin: 0 auto; }
  .btn { display:inline-block; margin: 0 0 22px; padding: 9px 18px; background: var(--accent);
         color:#fff; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 13px; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px;
           border-bottom: 2px solid var(--accent); padding-bottom: 18px; }
  .mark { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .mark .glyph { width: 38px; height: 38px; border-radius: 10px; background: var(--accent); color: #fff;
                 display: grid; place-items: center; font-size: 18px; font-weight: 800; flex: none; }
  .logo-img { max-height: 48px; max-width: 190px; object-fit: contain; }
  .co-name { font-size: 15px; font-weight: 800; letter-spacing: -.01em; }
  .co-contact { text-align: right; font-size: 11.5px; color: var(--soft); line-height: 1.65; }
  .title-row { display: flex; justify-content: space-between; align-items: flex-start;
               gap: 24px; margin-top: 20px; }
  h1 { font-size: 20px; margin: 0; letter-spacing: -.01em; }
  .ref { font-size: 14px; color: var(--accent); font-weight: 700; margin-top: 2px; }
  .meta-r { text-align: right; font-size: 12px; color: var(--muted); line-height: 1.7; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 36px; margin: 24px 0; }
  .grid div { display: flex; justify-content: space-between; gap: 16px;
              border-bottom: 1px dotted var(--line); padding: 6px 0; }
  .grid span:first-child { color: var(--muted); }
  .grid span:last-child { font-weight: 600; text-align: right; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { text-align: left; padding: 11px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .sub { color: var(--muted); font-size: 12px; margin-top: 2px; }
  tfoot td { border: none; padding: 6px 8px; }
  tfoot .total td { border-top: 2px solid var(--ink); font-weight: 800; font-size: 16px; padding-top: 10px; }
  .warn { background: #fff7e9; border: 1px solid #ecc57e; color: #7a5312; border-radius: 8px;
          padding: 11px 15px; margin-top: 18px; font-size: 13px; }
  .warn ul { margin: 6px 0 0; padding-left: 18px; }
  .pay { margin-top: 22px; padding: 13px 15px; background: #f6f8fb; border: 1px solid var(--line);
         border-radius: 8px; font-size: 12.5px; color: var(--soft); }
  .pay strong { display: block; margin-bottom: 4px; color: var(--ink); }
  footer { margin-top: 30px; font-size: 12px; color: var(--soft); }
  footer strong { color: var(--ink); }
  footer ul { margin: 6px 0 12px; padding-left: 18px; }
  @media print { body { padding: 0; } .noprint { display: none; } }
</style></head>
<body><div class="sheet">
  <a class="btn noprint" href="javascript:print()">Print / Save as PDF</a>
  <header>${letterhead}</header>

  <div class="title-row">
    <div>
      <h1>Freight Quotation</h1>
      <div class="ref">${esc(q.ref)}</div>
    </div>
    <div class="meta-r">
      <div>Issued ${esc((q.created_at || '').slice(0, 10))}</div>
      <div>Valid until ${esc(r.meta?.validUntil || '—')}</div>
      <div>Status: ${esc(q.status || 'draft')}</div>
    </div>
  </div>

  <div class="grid">${meta}</div>

  <table>
    <thead><tr><th>Charge</th><th class="num">Basis</th><th class="num">Original</th><th class="num">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr><td colspan="3" class="num">Subtotal</td><td class="num">${money(r.subtotal, ccy)}</td></tr>
      ${showTaxRow ? `<tr><td colspan="3" class="num">${esc(tax.label)} (${esc(tax.pct)}%)</td><td class="num">${money(tax.amount, ccy)}</td></tr>` : ''}
      <tr class="total"><td colspan="3" class="num">Total</td><td class="num">${money(r.total, ccy)}</td></tr>
    </tfoot>
  </table>

  ${warns}
  ${payBlock}

  <footer>
    <strong>Notes &amp; exclusions</strong>
    <ul>${notes || '<li>Standard carrier terms apply.</li>'}</ul>
    <p>Rates exclusive of customs duties, taxes, storage and regulatory charges unless line-itemed above.
    Carrier / airline / liner surcharges are charged at cost and valid at time of shipment (VATOS).</p>
  </footer>
</div></body></html>`;
}
