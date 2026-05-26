#!/usr/bin/env node
/**
 * EchoTik API smoke test (v2 — handles envelope + required params)
 *
 * Run: node --env-file=.env.local scripts/smoke-test.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const BASE_URL = process.env.ECHOTIK_BASE_URL || 'https://open.echotik.live/api/v3';
const USERNAME = process.env.ECHOTIK_USERNAME;
const PASSWORD = process.env.ECHOTIK_PASSWORD;

if (!USERNAME || !PASSWORD) {
  console.error('❌ Missing ECHOTIK_USERNAME / ECHOTIK_PASSWORD');
  process.exit(1);
}

const authHeader = 'Basic ' + Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');
const results = {};

async function call(label, endpoint, params = {}) {
  const url = new URL(BASE_URL + endpoint);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  console.log(`\n────────── ${label} ──────────`);
  console.log(`GET ${url.pathname}${url.search}`);

  const t0 = Date.now();
  let res, body;
  try {
    res = await fetch(url, {
      headers: { Authorization: authHeader, Accept: 'application/json' },
    });
    const text = await res.text();
    try { body = JSON.parse(text); } catch { body = text; }
  } catch (e) {
    console.log(`❌ network error: ${e.message}`);
    results[label] = { ok: false, error: e.message };
    return null;
  }
  const ms = Date.now() - t0;

  const httpOk = res.ok;
  const bizOk = body?.code === 200 || body?.code === 0 || body?.success === true;
  const ok = httpOk && bizOk;
  console.log(`${ok ? '✅' : '⚠️ '} HTTP ${res.status} · code=${body?.code} · ${ms}ms`);
  if (!bizOk && body?.message) console.log(`   message: ${body.message}`);

  const preview = JSON.stringify(body, null, 2);
  console.log(preview.length > 1500 ? preview.slice(0, 1500) + '\n...(truncated)' : preview);

  results[label] = {
    ok, httpStatus: res.status, code: body?.code, message: body?.message, ms,
    endpoint, params, body,
  };
  return body;
}

function pickId(resp, keys = ['product_id', 'productId', 'id', 'item_id', 'itemId']) {
  if (!resp?.data) return null;
  const candidates = [resp.data, resp.data.list, resp.data.items, resp.data.records, resp.data.result];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length) {
      for (const k of keys) if (c[0][k]) return c[0][k];
    }
  }
  return null;
}

// Try multiple parameter combos for the same call until one is accepted
async function tryVariants(label, endpoint, variants) {
  for (let i = 0; i < variants.length; i++) {
    const lbl = `${label} (try ${i + 1}/${variants.length})`;
    const r = await call(lbl, endpoint, variants[i]);
    const bizOk = r?.code === 200 || r?.code === 0;
    if (bizOk) return r;
  }
  return null;
}

(async () => {
  console.log(`EchoTik smoke test v2 → ${BASE_URL}`);
  console.log(`User: ${USERNAME.slice(0, 4)}…${USERNAME.slice(-4)}`);

  // 1. Category L1 — needs `language`
  const cats = await tryVariants('1. category/l1', '/echotik/category/l1', [
    { region: 'US', language: 'en' },
    { region: 'US', language: 'en-US' },
    { region: 'US', language: 'zh-CN' },
    { region: 'US', language: 'zh' },
  ]);

  // 2. Product ranklist — required: rank_type, page_num, date, product_rank_field, page_size
  // Try plausible enum combos
  const today = new Date().toISOString().slice(0, 10);          // 2026-05-26
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const ranklist = await tryVariants('2. product/ranklist', '/echotik/product/ranklist', [
    { region: 'US', rank_type: 'hot',    page_num: 1, page_size: 5, date: yesterday, product_rank_field: 'sales' },
    { region: 'US', rank_type: 'rising', page_num: 1, page_size: 5, date: yesterday, product_rank_field: 'sales_growth' },
    { region: 'US', rank_type: 'new',    page_num: 1, page_size: 5, date: yesterday, product_rank_field: 'sales' },
    { region: 'US', rank_type: 'hot',    page_num: 1, page_size: 5, date: yesterday, product_rank_field: 'gmv' },
    { region: 'US', rank_type: 1,        page_num: 1, page_size: 5, date: yesterday, product_rank_field: 1 },
    { region: 'US', rank_type: 'hot',    page_num: 1, page_size: 5, date: yesterday.replaceAll('-', ''), product_rank_field: 'sales' },
  ]);

  // 3-6. Pull one product through the funnel
  const productId = pickId(ranklist);
  if (productId) {
    console.log(`\n🎯 Using product_id = ${productId}`);

    await tryVariants('3. product/detail', '/echotik/product/detail', [
      { product_ids: productId, region: 'US' },
      { product_ids: productId, region: 'US', language: 'en-US' },
    ]);

    await tryVariants('4. product/influencer/list', '/echotik/product/influencer/list', [
      { product_id: productId, page_num: 1, page_size: 5 },
      { product_id: productId, page: 1, limit: 5 },
      { product_id: productId, page_num: 1, page_size: 5, date: yesterday },
    ]);

    await tryVariants('5. product/video/list', '/echotik/product/video/list', [
      { product_id: productId, page_num: 1, page_size: 5 },
      { product_id: productId, page: 1, limit: 5 },
      { product_id: productId, page_num: 1, page_size: 5, date: yesterday },
    ]);

    await tryVariants('6. product/trend', '/echotik/product/trend', [
      { product_id: productId, start_date: '2026-04-26', end_date: yesterday, page_num: 1, page_size: 10 },
    ]);
  } else {
    console.log('\n⚠️  Could not derive a product_id, skipping detail tests.');
  }

  // Save
  mkdirSync('scripts', { recursive: true });
  writeFileSync('scripts/smoke-test-output.json', JSON.stringify(results, null, 2));

  console.log('\n────────── SUMMARY ──────────');
  for (const [label, r] of Object.entries(results)) {
    const tag = r.ok ? '✅' : (r.httpStatus ? '⚠️ ' : '❌');
    console.log(`${tag} ${label.padEnd(50)} HTTP ${r.httpStatus ?? '—'} · code=${r.code ?? '—'}${r.message ? ' · ' + r.message.slice(0, 60) : ''}`);
  }
  console.log(`\n→ scripts/smoke-test-output.json`);
})().catch(e => { console.error('Fatal:', e); process.exit(1); });
