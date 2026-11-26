// pay.g2b.pl — wspólny worker płatności "Postaw mi kawę" dla wszystkich aplikacji G2B.
// SZABLON — przetestuj w sandboxie wybranego operatora przed produkcją.
// POST /            {app, coffees, amount(grosze), currency:'PLN', email, lang, returnUrl} -> {url}
//                   + opcjonalnie provider:'p24'|'paynow'|'stripe' (musi być na liście PROVIDERS)
// GET  /            -> {providers:[...]}  (lista włączonych operatorów, kolejność = priorytet)
// POST /notify/p24, /notify/paynow  webhooki operatorów (weryfikacja podpisu)
// Zmienne (wrangler secret put ...): PROVIDERS = 'p24,paynow,stripe' (kolejność = priorytet); ALLOWED_ORIGINS = 'https://groundcad.g2b.pl,https://simplecad.g2b.pl,...'
//   p24:    P24_MERCHANT_ID, P24_POS_ID, P24_API_KEY (klucz do API / REST), P24_CRC, P24_SANDBOX ('1' = sandbox)
//   paynow: PAYNOW_API_KEY, PAYNOW_SIGNATURE_KEY, PAYNOW_SANDBOX ('1' = sandbox)
//   stripe: STRIPE_SECRET_KEY
const PRICE_GROSZ = 999, MAX_COFFEES = 100;
const enc = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const sha384 = async s => hex(await crypto.subtle.digest('SHA-384', enc.encode(s)));
const json = (o, status, h) => new Response(JSON.stringify(o), { status: status || 200, headers: { 'Content-Type': 'application/json', ...h } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const cors = allowed.includes(origin) ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } : {};
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' } });
    const enabled = (env.PROVIDERS || 'p24').split(',').map(s => s.trim()).filter(Boolean);
    if (req.method === 'GET') return json({ providers: enabled }, 200, cors);
    if (req.method !== 'POST') return json({ error: 'method' }, 405);
    if (url.pathname === '/notify/p24') return notifyP24(req, env);
    if (url.pathname === '/notify/paynow') return notifyPaynow(req, env);
    if (!allowed.includes(origin)) return json({ error: 'forbidden' }, 403);

    let b; try { b = await req.json(); } catch { return json({ error: 'json' }, 400, cors); }
    const coffees = Math.floor(Number(b.coffees));
    if (!(coffees >= 1 && coffees <= MAX_COFFEES)) return json({ error: 'amount' }, 400, cors);
    const amount = coffees * PRICE_GROSZ;                       // kwotę liczymy po stronie serwera, nie ufamy klientowi
    const app = String(b.app || 'app').replace(/[^a-z0-9._-]/gi, '').slice(0, 40);
    const lang = b.lang === 'en' ? 'en' : 'pl';
    let ret; try { ret = new URL(b.returnUrl); } catch { return json({ error: 'return' }, 400, cors); }
    if (!allowed.includes(ret.origin)) return json({ error: 'return' }, 400, cors);   // tylko powrót do własnych domen
    const provider = b.provider ? String(b.provider) : enabled[0];
    if (!enabled.includes(provider)) return json({ error: 'provider' }, 400, cors);
    const desc = `Kawa dla G2B (${app}) x${coffees}`;
    try {
      const email = String(b.email || '');
      const link = provider === 'stripe' ? await stripe(env, { amount, coffees, desc, ret, lang })
        : provider === 'paynow' ? await paynow(env, { amount, desc, ret, email, app, origin: url.origin })
        : await p24(env, { amount, desc, ret, lang, email, app, origin: url.origin });
      return json({ url: link }, 200, cors);
    } catch (e) { return json({ error: 'provider' }, 502, cors); }
  }
};

// ---------- Stripe Checkout (BLIK, P24, karta; e-mail zbiera Stripe) ----------
async function stripe(env, { amount, coffees, desc, ret, lang }) {
  const f = new URLSearchParams({
    mode: 'payment', locale: lang, success_url: ret.href, cancel_url: ret.href,
    'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': 'pln',
    'line_items[0][price_data][unit_amount]': String(amount), 'line_items[0][price_data][product_data][name]': desc,
    'payment_method_types[0]': 'blik', 'payment_method_types[1]': 'p24', 'payment_method_types[2]': 'card'
  });
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY, 'Content-Type': 'application/x-www-form-urlencoded' }, body: f });
  const j = await r.json(); if (!r.ok || !j.url) throw new Error('stripe'); return j.url;
}

// ---------- Przelewy24 REST v1 ----------
const p24Base = env => env.P24_SANDBOX === '1' ? 'https://sandbox.przelewy24.pl' : 'https://secure.przelewy24.pl';
const p24Auth = env => 'Basic ' + btoa(env.P24_POS_ID + ':' + env.P24_API_KEY);
async function p24(env, { amount, desc, ret, lang, email, app, origin }) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('email');   // P24 wymaga e-maila płatnika
  const sessionId = `${app}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const merchantId = Number(env.P24_MERCHANT_ID), posId = Number(env.P24_POS_ID);
  const sign = await sha384(JSON.stringify({ sessionId, merchantId, amount, currency: 'PLN', crc: env.P24_CRC }));
  const body = { merchantId, posId, sessionId, amount, currency: 'PLN', description: desc, email, country: 'PL', language: lang,
    urlReturn: ret.href, urlStatus: origin + '/notify/p24', sign };
  const r = await fetch(p24Base(env) + '/api/v1/transaction/register', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: p24Auth(env) }, body: JSON.stringify(body) });
  const j = await r.json(); if (!r.ok || !j.data || !j.data.token) throw new Error('p24');
  return p24Base(env) + '/trnRequest/' + j.data.token;
}
async function notifyP24(req, env) {
  const n = await req.json().catch(() => null); if (!n) return new Response('bad', { status: 400 });
  const expect = await sha384(JSON.stringify({ merchantId: n.merchantId, posId: n.posId, sessionId: n.sessionId, amount: n.amount, originAmount: n.originAmount, currency: n.currency, orderId: n.orderId, methodId: n.methodId, statement: n.statement, crc: env.P24_CRC }));
  if (expect !== n.sign) return new Response('sign', { status: 400 });
  const sign = await sha384(JSON.stringify({ sessionId: n.sessionId, orderId: n.orderId, amount: n.amount, currency: n.currency, crc: env.P24_CRC }));
  const r = await fetch(p24Base(env) + '/api/v1/transaction/verify', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: p24Auth(env) },
    body: JSON.stringify({ merchantId: n.merchantId, posId: n.posId, sessionId: n.sessionId, amount: n.amount, currency: n.currency, orderId: n.orderId, sign }) });
  return new Response(r.ok ? 'OK' : 'verify failed', { status: r.ok ? 200 : 502 });   // P24 powtarza webhook, gdy nie dostanie 200
}

// ---------- Paynow (mBank) v3 ----------
// Podpis żądania: Base64(HMAC-SHA256(SignatureKey, JSON{headers:{Api-Key,Idempotency-Key}, parameters:{}, body:"<ciało jako string>"}))
async function hmacB64(key, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
  let bin = ''; sig.forEach(c => bin += String.fromCharCode(c)); return btoa(bin);
}
async function paynow(env, { amount, desc, ret, email, app, origin }) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('email');   // Paynow wymaga buyer.email
  const base = env.PAYNOW_SANDBOX === '1' ? 'https://api.sandbox.paynow.pl' : 'https://api.paynow.pl';
  const idem = crypto.randomUUID();
  const body = JSON.stringify({ amount, currency: 'PLN', externalId: `${app}-${Date.now()}-${idem.slice(0, 8)}`, description: desc, buyer: { email }, continueUrl: ret.href });
  const signature = await hmacB64(env.PAYNOW_SIGNATURE_KEY, JSON.stringify({ headers: { 'Api-Key': env.PAYNOW_API_KEY, 'Idempotency-Key': idem }, parameters: {}, body }));
  const r = await fetch(base + '/v3/payments', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Api-Key': env.PAYNOW_API_KEY, 'Idempotency-Key': idem, Signature: signature }, body });
  const j = await r.json(); if (!r.ok || !j.redirectUrl) throw new Error('paynow'); return j.redirectUrl;
}
// Powiadomienie: nagłówek Signature = Base64(HMAC-SHA256(SignatureKey, surowe ciało)). Odpowiedź 200 z pustym ciałem (inaczej Paynow ponawia ~48 h).
async function notifyPaynow(req, env) {
  const raw = await req.text();
  const expect = await hmacB64(env.PAYNOW_SIGNATURE_KEY, raw);
  if (expect !== req.headers.get('Signature')) return new Response(null, { status: 400 });
  // raw -> {paymentId, externalId, status, modifiedAt}; status CONFIRMED = opłacone. Tu można dopisać zapis/log.
  return new Response(null, { status: 200 });
}
