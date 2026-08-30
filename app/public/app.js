const $ = (id) => document.getElementById(id);
const api = async (url, opts) => {
  const res = await fetch(url, { headers: { 'content-type': 'application/json' }, ...opts });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || res.statusText);
  return body;
};
const money = (n, ccy) => `${ccy} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const state = { contract: null, lastResult: null, lastRequest: null };

// ---------- tabs ----------
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  $('view-' + t.dataset.view).classList.add('active');
  if (t.dataset.view === 'saved') loadQuotes();
  if (t.dataset.view === 'rates') renderRates();
}));

// ---------- LOAD DI ----------
const LOAD_TYPES = {
  land: [['LTL', 'LTL — less than truck load'], ['FTL', 'FTL — full truck load']],
  air: [['GENERAL', 'General cargo']],
  sea: [['LCL', 'LCL — less than container'], ['FCL', 'FCL — full container']],
  customs: [['CLEARANCE', 'Customs clearance']],
};

async function boot() {
  const contracts = await api('/api/contracts');
  const sel = $('contractId');
  sel.innerHTML = contracts.map(c => `<option value="${c.id}">${esc(c.carrier)} — ${esc(c.name)}</option>`).join('');
  await loadContract(contracts[0]?.id);
  addPieceRow();
  wire();
}

async function loadContract(id) {
  if (!id) return;
  state.contract = await api('/api/contracts/' + id);
  $('contractLabel').textContent = `${state.contract.carrier} · ${state.contract.customer || ''}`.trim();
  $('ratesContractName').textContent = '— ' + state.contract.name;
  syncLoadTypes();
}

function syncLoadTypes() {
  const mode = $('mode').value;
  $('loadType').innerHTML = (LOAD_TYPES[mode] || []).map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  syncDestinations();
}

function syncDestinations() {
  const mode = $('mode').value;
  const loadType = $('loadType').value;
  const lanes = (state.contract?.data?.lanes || []).filter(l =>
    l.mode === mode && (!loadType || l.loadType === loadType));
  $('destination').innerHTML = lanes.map(l => `<option value="${esc(l.destination)}">${esc(l.destination)}</option>`).join('')
    || '<option value="">(no lane — quote-based)</option>';
  syncLaneUi();
}

function syncLaneUi() {
  const lane = currentLane();
  const isFlat = !!lane?.flatRates;
  const isQuoteBased = !lane || lane.quoteBased || (!lane.breaks && !lane.flatRates);

  $('equipmentWrap').hidden = !isFlat;
  if (isFlat) {
    $('equipment').innerHTML = Object.keys(lane.flatRates)
      .map(k => `<option value="${k}">${k}</option>`).join('');
  }
  $('buyRateWrap').hidden = !isQuoteBased;

  // manual accessorials available on this contract for this mode
  const mode = $('mode').value;
  const accs = (state.contract?.data?.accessorials || []).filter(a =>
    (a.appliesWhen === 'manual') && (!a.mode || a.mode === 'any' || a.mode === mode));
  $('accessorialPicks').innerHTML = accs.length
    ? '<strong style="width:100%">Optional charges</strong>' + accs.map(a =>
        `<label><input type="checkbox" name="acc" value="${esc(a.code)}" /> ${esc(a.label)}` +
        `${a.rate ? ` <span class="muted">(${a.currency} ${a.rate})</span>` : ''}</label>`).join('')
    : '';
}

function currentLane() {
  const mode = $('mode').value, loadType = $('loadType').value, dest = $('destination').value;
  return (state.contract?.data?.lanes || []).find(l =>
    l.mode === mode && l.loadType === loadType && l.destination === dest);
}

// ---------- pieces ----------
function addPieceRow(p = {}) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="number" min="0" step="0.1" class="p-l" value="${p.lengthCm ?? ''}"></td>
    <td><input type="number" min="0" step="0.1" class="p-w" value="${p.widthCm ?? ''}"></td>
    <td><input type="number" min="0" step="0.1" class="p-h" value="${p.heightCm ?? ''}"></td>
    <td><input type="number" min="0" step="0.01" class="p-kg" value="${p.weightKg ?? ''}"></td>
    <td><input type="number" min="1" step="1" class="p-q" value="${p.quantity ?? 1}"></td>
    <td><button type="button" class="rm" title="remove">×</button></td>`;
  tr.querySelector('.rm').addEventListener('click', () => tr.remove());
  $('piecesBody').appendChild(tr);
}

function collectPieces() {
  return [...$('piecesBody').querySelectorAll('tr')].map(tr => ({
    lengthCm: +tr.querySelector('.p-l').value || 0,
    widthCm: +tr.querySelector('.p-w').value || 0,
    heightCm: +tr.querySelector('.p-h').value || 0,
    weightKg: +tr.querySelector('.p-kg').value || 0,
    quantity: +tr.querySelector('.p-q').value || 1,
  })).filter(p => p.weightKg || p.lengthCm);
}

// ---------- build request ----------
function buildRequest() {
  const cargoMode = document.querySelector('input[name=cargoMode]:checked').value;
  const req = {
    mode: $('mode').value,
    loadType: $('loadType').value,
    origin: $('origin').value.trim(),
    destination: $('destination').value,
    equipment: $('equipmentWrap').hidden ? null : $('equipment').value,
    containers: +$('containers').value || 1,
    buyRate: $('buyRateWrap').hidden ? undefined : (+$('buyRate').value || 0),
    markupType: $('markupType').value || undefined,
    markupValue: +$('markupValue').value || 0,
    quoteCurrency: $('quoteCurrency').value,
    selectedAccessorials: [...document.querySelectorAll('input[name=acc]:checked')].map(x => x.value),
    options: {
      applyVat: $('applyVat').checked,
      dangerousGoods: $('dangerousGoods').checked,
      originDutyPaid: $('originDutyPaid').checked,
      originalDocsReceived: $('originalDocsReceived').checked,
      insure: $('insure').checked,
      cargoValueAed: +$('cargoValueAed').value || 0,
      pickupEmirate: $('pickupEmirate').value || undefined,
      pickupTruckType: $('pickupTruckType').value || undefined,
    },
  };
  if (cargoMode === 'pieces') req.pieces = collectPieces();
  else { req.grossWeightKg = +$('grossWeightKg').value || 0; req.volumeCbm = +$('volumeCbm').value || 0; }
  return req;
}

// ---------- render result ----------
function renderResult(r) {
  state.lastResult = r;
  $('resultEmpty').hidden = true;
  $('resultBody').hidden = false;
  const ccy = r.quoteCurrency;
  const cw = r.chargeable || {};
  $('chargeableLine').textContent =
    r.chargeableKg != null
      ? `Chargeable: ${r.chargeableKg} ${$('mode').value === 'sea' ? 'RT' : 'kg'} · ${cw.basis || ''}` +
        (cw.volumeCbm ? ` · ${cw.volumeCbm} CBM` : '') + ` · lane ${r.meta?.laneMatched ? 'matched' : 'NOT matched'}`
      : '';

  $('breakdownBody').innerHTML = (r.lines || []).map(l => `
    <tr>
      <td>${esc(l.label)}</td>
      <td class="ln-detail">${esc(l.detail || '')}${l.currency && l.currency !== ccy ? ` · ${esc(l.currency)} ${Number(l.amountOriginal).toLocaleString('en-US',{minimumFractionDigits:2})}` : ''}</td>
      <td class="num">${money(l.amount, ccy)}</td>
    </tr>`).join('');

  $('breakdownFoot').innerHTML = `
    <tr><td colspan="2" class="num">Subtotal</td><td class="num">${money(r.subtotal, ccy)}</td></tr>
    <tr><td colspan="2" class="num">VAT (${r.vatPct || 0}%)</td><td class="num">${money(r.vat, ccy)}</td></tr>
    <tr class="total"><td colspan="2" class="num">Total</td><td class="num">${money(r.total, ccy)}</td></tr>`;

  const wb = $('warnBox');
  if (r.warnings?.length) { wb.hidden = false; wb.innerHTML = '<strong>Check:</strong><ul>' + r.warnings.map(w => `<li>${esc(w)}</li>`).join('') + '</ul>'; }
  else wb.hidden = true;

  $('savedInfo').hidden = true;
  $('saveBtn').disabled = false;
}

// ---------- wiring ----------
function wire() {
  $('contractId').addEventListener('change', e => loadContract(+e.target.value));
  $('mode').addEventListener('change', syncLoadTypes);
  $('loadType').addEventListener('change', syncDestinations);
  $('destination').addEventListener('change', syncLaneUi);
  $('addPiece').addEventListener('click', () => addPieceRow());
  document.querySelectorAll('input[name=cargoMode]').forEach(r => r.addEventListener('change', e => {
    const pieces = e.target.value === 'pieces';
    $('piecesBox').hidden = !pieces;
    $('summaryBox').hidden = pieces;
  }));

  $('quoteForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      state.lastRequest = buildRequest();
      const r = await api('/api/quote', { method: 'POST', body: JSON.stringify({ contractId: +$('contractId').value, request: state.lastRequest }) });
      renderResult(r);
    } catch (err) { alert('Pricing failed: ' + err.message); }
  });

  $('saveBtn').addEventListener('click', async () => {
    try {
      const out = await api('/api/quotes', {
        method: 'POST',
        body: JSON.stringify({ contractId: +$('contractId').value, customer: $('customer').value.trim(), request: state.lastRequest }),
      });
      const si = $('savedInfo');
      si.hidden = false;
      si.innerHTML = `Saved as <strong>${esc(out.ref)}</strong> — ` +
        `<a href="/api/quotes/${out.ref}/print" target="_blank">open printable quote →</a>`;
      $('saveBtn').disabled = true;
    } catch (err) { alert('Save failed: ' + err.message); }
  });

  $('saveRates').addEventListener('click', async () => {
    try {
      const data = JSON.parse($('rateJson').value);
      await api('/api/contracts/' + state.contract.id + '/data', { method: 'PUT', body: JSON.stringify(data) });
      await loadContract(state.contract.id);
      $('rateSaveMsg').textContent = 'Saved. Pricing updated.';
      renderRates();
    } catch (err) { $('rateSaveMsg').textContent = 'Error: ' + err.message; }
  });
}

// ---------- saved quotes ----------
async function loadQuotes() {
  const rows = await api('/api/quotes');
  $('quotesBody').innerHTML = rows.map(q => `
    <tr>
      <td><a href="/api/quotes/${q.ref}/print" target="_blank">${esc(q.ref)}</a></td>
      <td>${esc(q.customer || '—')}</td>
      <td>${esc(q.origin || '')} → ${esc(q.destination || '')}</td>
      <td>${esc(q.mode)} ${esc(q.load_type || '')}</td>
      <td class="num">${money(q.total, q.quote_currency || 'AED')}</td>
      <td><span class="pill ${q.status}">${q.status}</span></td>
      <td>
        <select data-ref="${q.ref}" class="statusSel">
          ${['draft', 'sent', 'won', 'lost'].map(s => `<option ${s === q.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </td>
    </tr>`).join('') || '<tr><td colspan="7" class="muted">No quotes yet.</td></tr>';
  document.querySelectorAll('.statusSel').forEach(sel => sel.addEventListener('change', async e => {
    await api('/api/quotes/' + e.target.dataset.ref, { method: 'PATCH', body: JSON.stringify({ status: e.target.value }) });
    loadQuotes();
  }));
}

// ---------- rate cards ----------
function renderRates() {
  const d = state.contract?.data;
  if (!d) return;
  $('rateJson').value = JSON.stringify(d, null, 2);
  const lanesByType = {};
  for (const l of d.lanes) (lanesByType[`${l.mode} · ${l.loadType}`] ||= []).push(l);

  let html = '';
  for (const [k, lanes] of Object.entries(lanesByType)) {
    html += `<div class="rate-block"><h3>${esc(k)}</h3><table>`;
    if (lanes[0].breaks) {
      html += `<tr><th>Destination</th><th>Min (≤100kg)</th>` +
        lanes[0].breaks.map(b => `<th>${b.upTo ? '≤' + b.upTo : '4000+'} kg</th>`).join('') + `</tr>`;
      for (const l of lanes) html += `<tr><td>${esc(l.destination)}</td><td>${l.minCharge}</td>` +
        l.breaks.map(b => `<td>${b.rate}</td>`).join('') + `</tr>`;
    } else if (lanes[0].flatRates) {
      const cols = [...new Set(lanes.flatMap(l => Object.keys(l.flatRates)))];
      html += `<tr><th>Destination</th>` + cols.map(c => `<th>${esc(c)}</th>`).join('') + `</tr>`;
      for (const l of lanes) html += `<tr><td>${esc(l.destination)}</td>` +
        cols.map(c => `<td>${l.flatRates[c] ?? '—'}</td>`).join('') + `</tr>`;
    } else {
      html += `<tr><th>Lane</th><th>Pricing</th></tr>`;
      for (const l of lanes) html += `<tr><td>${esc(l.destination)}</td><td>quote-based (manual buy rate)</td></tr>`;
    }
    html += `</table></div>`;
  }
  html += `<div class="rate-block"><h3>Accessorials</h3><table><tr><th>Code</th><th>Label</th><th>Basis</th><th>Rate</th><th>When</th></tr>`;
  for (const a of d.accessorials) html += `<tr><td>${esc(a.code)}</td><td>${esc(a.label)}</td><td>${esc(a.basis)}</td><td>${a.currency} ${a.rate}</td><td>${esc(a.appliesWhen)}</td></tr>`;
  html += `</table></div>`;
  $('ratesSummary').innerHTML = html;
}

boot().catch(err => alert('Startup error: ' + err.message));
