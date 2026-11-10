// 注文の「計算し直し用の明細（line_items）」と、サーバーが断ったときの案内表示のテスト。
//
// 2026-11 PR-4: 催事アプリ（サーバー）が注文の金額を自分で計算し直すようになる。
// サーバーは line_items（商品・サイズ・数量）から、このページの buildOrderPayload() と
// 「1文字も違わない」明細の文面（items）と合計（total）を組み立て直す。
//
// このテストは本物の index.html の商品行と、本物の app.js の関数を使って注文データを作り、
// tests/fixtures/line_items_golden.json（黄金データ）と一致することを確かめる。
// 同じ黄金データを催事アプリ側のテスト（tests/fixtures/hp_pricing_golden.json）が
// 「サーバーが組み直した結果」と突き合わせている。
//
// ⚠ 明細の文面・商品行・値段を変えてこのテストが落ちたら:
//   1. UPDATE_GOLDEN=1 node --test tests/test_line_items.cjs で黄金データを作り直す
//   2. 催事アプリ側の tests/fixtures/hp_pricing_golden.json に同じファイルを写し、
//      order_mgmt/hp_pricing.py（サーバー側の文面・例外商品の値段）を合わせる
//   片方だけ直すと、本番で「金額が合いませんでした」と注文が断られる。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const GOLDEN_PATH = path.join(__dirname, 'fixtures', 'line_items_golden.json');

function segment(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert(a >= 0 && b > a, start);
  return source.slice(a, b);
}
const code = [
  'let reviewedOrder = null, orderSubmissionInProgress = false, shippingAddressPending = false;',
  // サイズ選択（selectOrderSize / selectOrderUnitSize / selectOrderTeaSize）も本物を使う
  segment('  function getRowMultiplier(row)', '  // Add to order from menu card'),
  segment('  const FREE_SHIPPING_LINE', '  function getStripe()'),
  segment('  function getOrderTotalNum()', '  function useAllPoints()'),
  segment('  function buildOrderPayload()', '  function showOrderCompleteScreen('),
  segment('  const CARD_INCOMPLETE_MSG', '  async function mountCardPaymentElement('),
  segment('  const SHIPPING_DEFAULT_NOTE', '  function resetOrderForm()'),
].join('\n');

// ── 本物の index.html から注文フォームの商品行を読み取る ──────────────
function camel(name) { return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }
function dataAttrs(tag) {
  const dataset = {};
  for (const m of tag.matchAll(/data-([a-z-]+)="([^"]*)"/g)) dataset[camel(m[1])] = m[2];
  return dataset;
}
function classSet(initial) {
  const classes = new Set(initial);
  return { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x) };
}
function parseOrderRows() {
  const listStart = html.indexOf('<div class="order-product-list');
  const listEnd = html.indexOf('<div class="order-total-bar', listStart);
  assert(listStart >= 0 && listEnd > listStart, 'order-product-list');
  const blocks = html.slice(listStart, listEnd).split('<div class="order-product-row').slice(1);
  return blocks.map(block => {
    const rowTag = block.slice(0, block.indexOf('>'));
    const classes = rowTag.slice(0, rowTag.indexOf('"')).trim().split(/\s+/).filter(Boolean);
    const name = block.match(/<div class="order-product-name">([^<]*)<\/div>/)[1];
    const text = value => ({ textContent: value, innerHTML: '', style: {}, classList: classSet([]) });
    const parts = {
      '.order-product-name': text(name),
      '.order-qty-num': text('0'),
      '.order-subtotal': text('-'),
      '.order-product-price': text(''),
      '.order-size-hint': text(''),
    };
    const row = {
      dataset: dataAttrs(rowTag),
      classList: classSet(['order-product-row', ...classes]),
      querySelector: selector => parts[selector] || null,
      querySelectorAll: selector => selector === '.order-size-btn' ? row.buttons : [],
      buttons: [],
    };
    for (const m of block.matchAll(/<button type="button" class="order-size-btn[^"]*"([^>]*)>([^<]*)/g)) {
      row.buttons.push({
        dataset: dataAttrs(m[1]), label: m[2], handler: m[1].match(/onclick="(\w+)\(this\)"/)[1],
        classList: classSet([]), closest: () => row,
      });
    }
    return row;
  });
}

function harness({ payment = 'bank', address = '福岡県確認市' } = {}) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) {
      nodes.set(id, { id, value: '', textContent: '', style: {}, disabled: false,
        classList: classSet([]), addEventListener() {}, scrollIntoView() {}, focus() {},
        hasAttribute: () => false, removeAttribute() {}, setAttribute() {} });
    }
    return nodes.get(id);
  };
  const rows = parseOrderRows();
  const values = { orderName: '確認用のお客様', orderPhone: '00000000000', orderEmail: '',
    orderZip: '000-0000', orderAddress: address, orderBanchi: '1-2-3', orderBuilding: '',
    orderDelivery: 'yamato', orderPayment: payment, orderDate: '', orderNote: '',
    orderMemberId: '', pointUseAmount: '0' };
  for (const [id, value] of Object.entries(values)) node(id).value = value;
  const log = { requests: [], success: [] };
  let resolveOrder;
  const context = {
    document: { getElementById: node, createElement: () => node('scratch'),
      querySelectorAll: selector => selector === '.order-product-row' ? rows : [],
      querySelector: () => null, body: node('body') },
    customerPoints: 0, MIN_POINT_USE: 50,
    PAYMENT_RETURN_URL: 'http://127.0.0.1/order-complete/',
    alert() {}, updateFloatingCart() {}, applyPointDiscount() {}, scheduleCardRemount() {},
    showCardError() {}, updateCardPaymentUI() {}, unmountCardPaymentElement() {},
    async mountCardPaymentElement() {}, getStripe: () => null,
    fetch(url, options) {
      log.requests.push({ url, payload: JSON.parse(options.body) });
      return new Promise(resolve => { resolveOrder = resolve; });
    },
    showOrderCompleteScreen(payload) { log.success.push(payload); context.hideOrderProcessingOverlay(); },
    showOrderCompletePending() {},
  };
  vm.createContext(context); vm.runInContext(code, context);
  return {
    rows, node, log, context,
    // 商品名で行を選び、（あれば）サイズのボタンを本物の関数で押してから数量を入れる
    pick(name, qty, sizeLabel) {
      const row = rows.find(r => r.querySelector('.order-product-name').textContent === name);
      assert(row, '商品行が見つからない: ' + name);
      if (sizeLabel) {
        const btn = row.buttons.find(b => b.label === sizeLabel);
        assert(btn, name + ' にサイズ ' + sizeLabel + ' が無い');
        context[btn.handler](btn);
      }
      row.querySelector('.order-qty-num').textContent = String(qty);
      context.updateTotal();
    },
    payload() { context.updateTotal(); return JSON.parse(JSON.stringify(context.buildOrderPayload())); },
    submit(payload) { context.submitReviewedOrder(payload); },
    respond(response) { resolveOrder(response); },
  };
}
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }

// ── 黄金データの元になる注文の一覧（商品名・サイズは index.html のボタンの文字そのまま）──
const CASES = [
  { id: '焼売4個入を3袋・銀行振込・福岡', picks: [['肉焼売【生冷凍】', 3, '4個']] },
  { id: '8個入と12個入の混在・東京', address: '東京都確認区',
    picks: [['肉焼売【調理済み冷凍】', 1, '8個'], ['海老焼売【生冷凍】', 1, '12個']] },
  { id: '8000円以上で送料無料・大阪', address: '大阪府確認市', picks: [['焼き小籠包', 10, '4個']] },
  { id: 'まん類とちまきのサイズ違い', address: '愛知県確認市',
    picks: [['肉にら饅頭【生冷凍】', 1, '4個'], ['ちまき', 1, '4個'], ['肉まん', 1, '3個'],
      ['角煮バーガー', 2, '1個'], ['チャーシューまん', 1, '6個']] },
  { id: 'ザーサイ140gを3つ', picks: [['ザーサイ', 3, '140g']] },
  { id: 'ザーサイ280gを2つ・代引き（手数料330円）', payment: 'cod', picks: [['ザーサイ', 2, '280g']] },
  { id: 'モンゴル茶1袋', picks: [['モンゴル茶', 1, '1袋']] },
  { id: 'モンゴル茶2袋セット・代引き（手数料330円）', payment: 'cod', picks: [['モンゴル茶', 1, '2袋']] },
  { id: 'モンゴル茶3袋セットを2つ・代引き・送料無料（手数料440円）', payment: 'cod',
    picks: [['モンゴル茶', 2, '3袋']] },
  { id: 'モンゴル茶3袋セットを3つ・代引き（手数料660円）', payment: 'cod', picks: [['モンゴル茶', 3, '3袋']] },
  { id: '北海道宛は送料別途ご案内', address: '北海道確認市', picks: [['肉焼売【生冷凍】', 3, '4個']] },
  { id: '沖縄宛の代引きは手数料も別途', address: '沖縄県確認市', payment: 'cod',
    picks: [['海老焼売【調理済み冷凍】', 3, '4個']] },
  { id: 'カード決済・福岡', payment: 'credit', picks: [['肉にら饅頭【調理済み冷凍】', 2, '8個']] },
  { id: '全商品を1つずつ（サイズは初期のまま）', address: '京都府確認市', all: true },
];

function buildCase(spec) {
  const h = harness({ payment: spec.payment || 'bank', address: spec.address || '福岡県確認市' });
  if (spec.all) {
    for (const row of h.rows) h.pick(row.querySelector('.order-product-name').textContent, 1);
  }
  for (const [name, qty, size] of spec.picks || []) h.pick(name, qty, size);
  return { id: spec.id, payload: h.payload() };
}

test('注文フォームの商品行を index.html から読めている（焼き小籠包〜モンゴル茶の13行）', () => {
  const names = parseOrderRows().map(r => r.querySelector('.order-product-name').textContent);
  assert.equal(names.length, 13);
  assert.equal(names[0], '焼き小籠包');
  assert.equal(names[12], 'モンゴル茶');
});

test('line_items には商品名・数量・サイズだけを入れ、値段は入れない', () => {
  const { payload } = buildCase({ id: 'x', payment: 'cod',
    picks: [['肉焼売【生冷凍】', 2, '8個'], ['ザーサイ', 1, '280g'], ['モンゴル茶', 1, '3袋']] });
  assert.deepEqual(payload.line_items, [
    { name: '肉焼売【生冷凍】', qty: 2, multiplier: 2, size: null, tea_bags: null },
    { name: 'ザーサイ', qty: 1, multiplier: null, size: '280g', tea_bags: null },
    { name: 'モンゴル茶', qty: 1, multiplier: null, size: null, tea_bags: 3 },
  ]);
  assert.doesNotMatch(JSON.stringify(payload.line_items), /price|¥/);
});

test('従来の items・total はそのまま残る（旧サーバーとも互換）', () => {
  const { payload } = buildCase(CASES[0]);
  assert.deepEqual(payload.items, ['肉焼売【生冷凍】 4個入 × 3袋（計12個）¥2,280', '送料（福岡県宛） ¥1,200']);
  assert.equal(payload.total, '¥3,480');
});

test('黄金データ：本物の画面が作る注文データが保存済みの期待値と一致する', () => {
  const built = { note: 'aikarou-hp tests/test_line_items.cjs が作る。手で直さない', cases: CASES.map(buildCase) };
  if (process.env.UPDATE_GOLDEN === '1') {
    fs.mkdirSync(path.dirname(GOLDEN_PATH), { recursive: true });
    fs.writeFileSync(GOLDEN_PATH, JSON.stringify(built, null, 2) + '\n');
  }
  const golden = JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8'));
  assert.deepEqual(built, golden);
});

test('銀行振込でサーバーが400で断ったら、その案内文を画面に出して入力に戻す', async () => {
  const h = harness(); h.pick('肉焼売【生冷凍】', 3, '4個');
  h.submit(h.payload());
  assert.equal(h.log.requests.length, 1);
  assert.equal(h.log.requests[0].payload.line_items.length, 1);
  h.respond({ ok: false, status: 400,
    json: async () => ({ error: '金額が合いませんでした。ページを再読み込みしてもう一度お試しください' }) });
  await flush();
  const box = h.node('orderErrorBox');
  assert.equal(box.style.display, '');
  assert.match(box.textContent, /金額が合いませんでした。ページを再読み込みしてもう一度お試しください/);
  assert.match(box.textContent, /まだ送信されていません/);
  assert.equal(h.log.success.length, 0);
  assert.equal(h.node('orderSubmitBtn').textContent, '注文内容を確認する');
  assert.equal(h.node('orderSubmitBtn').disabled, false);
});

test('500や本文の読めないエラーでは従来どおりの固定文に戻す（前の案内文を残さない）', async () => {
  const h = harness(); h.pick('肉焼売【生冷凍】', 3, '4個');
  h.node('orderErrorBox').textContent = '金額が合いませんでした。（前回の案内）';
  h.submit(h.payload());
  h.respond({ ok: false, status: 500, json: async () => ({ error: '内部の詳しい理由' }) });
  await flush();
  assert.equal(h.node('orderErrorBox').textContent,
    '送信できませんでした。お手数ですが、時間をおいて再度お試しいただくか、LINEでご注文ください。');
  h.submit(h.payload());
  h.respond({ ok: false, status: 400, json: async () => { throw new Error('not json'); } });
  await flush();
  assert.equal(h.node('orderErrorBox').textContent,
    '送信できませんでした。お手数ですが、時間をおいて再度お試しいただくか、LINEでご注文ください。');
  assert.equal(h.log.success.length, 0);
});

test('成功したときは従来どおり完了画面へ進む', async () => {
  const h = harness(); h.pick('肉焼売【生冷凍】', 3, '4個');
  const payload = h.payload();
  h.submit(payload);
  h.respond({ ok: true, status: 200, json: async () => ({ success: true }) });
  await flush();
  assert.equal(h.log.success.length, 1);
  assert.deepEqual(h.log.success[0], payload);
});
