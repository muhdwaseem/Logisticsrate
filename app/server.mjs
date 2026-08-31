/**
 * Freight Rate & Quotation System — HTTP server.
 * Built on node:http + node:sqlite, no npm dependencies.
 *
 *   node server.mjs            # http://localhost:4700
 *   PORT=8080 node server.mjs
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeQuote } from './src/rate-engine.mjs';
import {
  listCarriers, listContracts, getContract, updateContractData, createContract,
  nextQuoteRef, saveQuote, getQuote, listQuotes, setQuoteStatus,
} from './src/db.mjs';
import { renderQuoteHtml } from './src/quote-doc.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 4700;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

const json = (res, code, body) => {
  const s = JSON.stringify(body, null, 2);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(s) });
  res.end(s);
};

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'Invalid JSON body'); }
}

class HttpError extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

async function serveStatic(req, res) {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/') path = '/index.html';
  const full = normalize(join(PUBLIC, path));
  if (!full.startsWith(PUBLIC)) return json(res, 403, { error: 'forbidden' });
  try {
    const data = await readFile(full);
    res.writeHead(200, { 'content-type': MIME[extname(full)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    // SPA fallback: an extension-less path (e.g. /saved, /tariffs) is a
    // client-side route — hand back index.html so the app can render it.
    if (!extname(full)) {
      try {
        const html = await readFile(join(PUBLIC, 'index.html'));
        res.writeHead(200, { 'content-type': MIME['.html'] });
        return res.end(html);
      } catch { /* fall through to 404 */ }
    }
    json(res, 404, { error: 'not found' });
  }
}

const routes = [];
const route = (method, pattern, handler) => routes.push({ method, pattern, handler });

// ---- API routes ---------------------------------------------------------
route('GET', /^\/api\/health$/, (_m, _req, res) =>
  json(res, 200, { ok: true, service: 'freight-rate-system', time: new Date().toISOString() }));

route('GET', /^\/api\/carriers$/, (_m, _req, res) => json(res, 200, listCarriers()));

route('GET', /^\/api\/contracts$/, (_m, _req, res) => json(res, 200, listContracts()));

route('GET', /^\/api\/contracts\/(\d+)$/, (m, _req, res) => {
  const c = getContract(Number(m[1]));
  return c ? json(res, 200, c) : json(res, 404, { error: 'contract not found' });
});

route('POST', /^\/api\/contracts$/, async (_m, req, res) => {
  const body = await readBody(req);
  if (!body.name || !body.carrierName || !body.data)
    throw new HttpError(400, 'carrierName, name and data are required');
  json(res, 201, createContract(body));
});

route('PUT', /^\/api\/contracts\/(\d+)\/data$/, async (m, req, res) => {
  const body = await readBody(req);
  if (!body || !body.contract || !Array.isArray(body.lanes))
    throw new HttpError(400, 'body must be { contract, lanes[], accessorials[] }');
  const ok = updateContractData(Number(m[1]), body);
  return ok ? json(res, 200, getContract(Number(m[1]))) : json(res, 404, { error: 'contract not found' });
});

// price without saving
route('POST', /^\/api\/quote$/, async (_m, req, res) => {
  const { contractId, request } = await readBody(req);
  const c = getContract(Number(contractId));
  if (!c) throw new HttpError(400, 'unknown contractId');
  json(res, 200, computeQuote(request || {}, c.data));
});

// price and save
route('POST', /^\/api\/quotes$/, async (_m, req, res) => {
  const { contractId, customer, request } = await readBody(req);
  const c = getContract(Number(contractId));
  if (!c) throw new HttpError(400, 'unknown contractId');
  const result = computeQuote(request || {}, c.data);
  const ref = nextQuoteRef();
  const saved = saveQuote({ ref, contractId: c.id, customer, request: request || {}, result });
  json(res, 201, { ref, result, quote: saved });
});

route('GET', /^\/api\/quotes$/, (_m, _req, res) => json(res, 200, listQuotes()));

route('GET', /^\/api\/quotes\/([A-Za-z0-9-]+)$/, (m, _req, res) => {
  const q = getQuote(m[1]);
  return q ? json(res, 200, q) : json(res, 404, { error: 'quote not found' });
});

route('PATCH', /^\/api\/quotes\/([A-Za-z0-9-]+)$/, async (m, req, res) => {
  const { status } = await readBody(req);
  if (!['draft', 'sent', 'won', 'lost'].includes(status)) throw new HttpError(400, 'bad status');
  const ok = setQuoteStatus(m[1], status);
  return ok ? json(res, 200, getQuote(m[1])) : json(res, 404, { error: 'quote not found' });
});

route('GET', /^\/api\/quotes\/([A-Za-z0-9-]+)\/print$/, (m, _req, res) => {
  const q = getQuote(m[1]);
  if (!q) return json(res, 404, { error: 'quote not found' });
  const contract = q.contract_id ? getContract(q.contract_id) : null;
  const html = renderQuoteHtml(q, contract);
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
});

// ---- dispatch ---------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  try {
    if (pathname.startsWith('/api/')) {
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = pathname.match(r.pattern);
        if (m) return await r.handler(m, req, res);
      }
      return json(res, 404, { error: `no route for ${req.method} ${pathname}` });
    }
    return await serveStatic(req, res);
  } catch (err) {
    if (err instanceof HttpError) return json(res, err.status, { error: err.message });
    console.error(err);
    return json(res, 500, { error: 'internal error', detail: String(err && err.message || err) });
  }
});

server.listen(PORT, () => {
  console.log(`\n  Freight Rate & Quotation System`);
  console.log(`  → http://localhost:${PORT}\n`);
});
