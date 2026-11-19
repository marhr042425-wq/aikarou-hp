// 新しいトップページ（index-a.html・top.js）の、注文の「計算し直し用の明細（line_items）」のテスト。
//
// 新しいページは、注文フォームの行を「1品」から「1品×1入数」に分けた（38行）。
// 同じ品の 4個入 と 8個入 を同時に頼めるようにするためで、送る中身の形（明細の文面・合計・line_items）は変えていない。
//
// このテストが確かめること：
//   1. 今のHPの黄金データ（tests/fixtures/line_items_golden.json の14通り）と、
//      新しいページが作る注文データが「一字一句同じ」＝行の持ち方を変えても、サーバーへ送る中身は変わっていない。
//   2. そこへ「同じ品の入数違いを同時」の場合を足した黄金データ（tests/fixtures/top_line_items_golden.json）。
//      催事アプリ側のテスト（tests/fixtures/hp_pricing_golden.json）へ写して、サーバーの検算と突き合わせる用。
//   3. ブラウザの「ページを翻訳」でも注文が通る（38行すべてに data-product-name）。
//
// ⚠ 明細の文面・商品行・値段を変えてこのテストが落ちたら:
//   1. UPDATE_GOLDEN=1 node --test tests/test_top_line_items.cjs で黄金データを作り直す
//   2. 催事アプリ側の tests/fixtures/hp_pricing_golden.json に同じファイルを写し、
//      order_mgmt/hp_pricing.py（サーバー側の文面・例外商品の値段）を合わせる
//   片方だけ直すと、本番で「金額が合いませんでした」と注文が断られる。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'top.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index-a.html'), 'utf8');
const OLD_GOLDEN_PATH = path.join(__dirname, 'fixtures', 'line_items_golden.json');
const GOLDEN_PATH = path.join(__dirname, 'fixtures', 'top_line_items_golden.json');

function segment(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert(a >= 0 && b > a, start);
  return source.slice(a, b);
}
const code = [
  'let reviewedOrder = null, orderSubmissionInProgress = false, shippingAddressPending = false;',
  segment('  function getRowMultiplier(row)', '  // Add to order from menu card'),
  segment('  function getRowLabel(row)', '  // メニューのカード1枚'),
  segment('  const FREE_SHIPPING_LINE', '  function getStripe()'),
  segment('  function getOrderTotalNum()', '  function useAllPoints()'),
  segment('  function buildOrderPayload()', '  function showOrderCompleteScreen('),
  segment('  const CARD_INCOMPLETE_MSG', '  async function mountCardPaymentElement('),
  segment('  const SHIPPING_DEFAULT_NOTE', '  function resetOrderForm()'),
].join('\n');

// ── 本物の index-a.html から注文フォームの行（1品×1入数）を読み取る ──────────────
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
  const listStart = html.indexOf('<div class="pks order-product-list" id="orderRows">');
  const listEnd = html.indexOf('<div class="pk-empty" id="orderEmpty">', listStart);
  assert(listStart >= 0 && listEnd > listStart, 'orderRows');
  const blocks = html.slice(listStart, listEnd).split('<div class="order-product-row').slice(1);
  return blocks.map(block => {
    const rowTag = block.slice(0, block.indexOf('>'));
    const classes = rowTag.slice(0, rowTag.indexOf('"')).trim().split(/\s+/).filter(Boolean);
    // 画面の商品名（「肉焼売<wbr>【生冷凍】」の <wbr> は折り返しの目印で、文字ではない）
    const name = block.match(/<span class="order-product-name">(.*?)<\/span>/)[1].replace(/<wbr>/g, '');
    const text = value => ({ textContent: value, innerHTML: '', style: {}, classList: classSet([]) });
    const parts = {
      '.order-product-name': text(name),
      '.order-qty-num': text('0'),
      '.order-subtotal': text('-'),
      '.order-product-price': text(''),
    };
    return {
      html: block,
      hidden: /\shidden>/.test(rowTag + '>'),
      dataset: dataAttrs(rowTag),
      classList: classSet(['order-product-row', ...classes]),
      querySelector: selector => parts[selector] || null,
      querySelectorAll: () => [],
    };
  });
}

function harness({ payment = 'bank', address = '福岡県確認市' } = {}) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) {
      nodes.set(id, { id, value: '', textContent: '', style: {}, disabled: false, hidden: false,
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
    HP_CONFIG: { mode: 'local', apiBase: 'http://local.test', stripeKey: '', canSend: true, blockedMessage: '', ready: Promise.resolve() },
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
  // 今のHPの「サイズのボタンの文字」（4個・8個・280g・2袋…）から、新しいページの行（入数の札）を選ぶ
  const rowLabel = size => /袋$/.test(size) ? size + 'セット' : /個$/.test(size) ? size + '入' : size;
  return {
    rows, node, log, context,
    find(name, sizeLabel) {
      const row = sizeLabel
        ? rows.find(r => r.dataset.productName === name && r.dataset.sizeLabel === rowLabel(sizeLabel))
        : rows.find(r => r.dataset.productName === name && r.dataset.sizeIndex === '0');
      assert(row, '行が見つからない: ' + name + ' ' + (sizeLabel || '（最初の入数）'));
      return row;
    },
    // 商品名と入数で行を選び、数量を入れる（新しいページでは、入数ごとに別の行）
    pick(name, qty, sizeLabel) {
      this.find(name, sizeLabel).querySelector('.order-qty-num').textContent = String(qty);
      context.updateTotal();
    },
    payload() { context.updateTotal(); return JSON.parse(JSON.stringify(context.buildOrderPayload())); },
    submit(payload) { context.submitReviewedOrder(payload); },
    respond(response) { resolveOrder(response); },
  };
}
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }

// ── 今のHPの黄金データと同じ14通り（tests/test_line_items.cjs の CASES と同じ中身・同じ順番）──
const OLD_CASES = [
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
// ── 新しいページで増えた場合：同じ品の入数違いを同時に頼む ──
const NEW_CASES = [
  { id: '同じ品の入数違いを同時：肉焼売【生冷凍】4個入×1と8個入×2',
    picks: [['肉焼売【生冷凍】', 1, '4個'], ['肉焼売【生冷凍】', 2, '8個']] },
  { id: '同じ品の入数違いを同時：ザーサイ140gと280g・モンゴル茶1袋と2袋セット・代引き', payment: 'cod', address: '東京都確認区',
    picks: [['ザーサイ', 1, '140g'], ['ザーサイ', 2, '280g'], ['モンゴル茶', 1, '1袋'], ['モンゴル茶', 1, '2袋']] },
  { id: '同じ品の入数違いを同時：生冷凍と調理済みを入数3つずつ・カード', payment: 'credit', address: '大阪府確認市',
    picks: [['海老焼売【生冷凍】', 1, '4個'], ['海老焼売【生冷凍】', 1, '8個'], ['海老焼売【生冷凍】', 1, '12個'],
      ['海老焼売【調理済み冷凍】', 2, '4個'], ['海老焼売【調理済み冷凍】', 1, '12個'], ['ちまき', 1, '2個'], ['ちまき', 1, '6個']] },
];

function buildCase(spec) {
  const h = harness({ payment: spec.payment || 'bank', address: spec.address || '福岡県確認市' });
  if (spec.all) {
    for (const row of h.rows.filter(r => r.dataset.sizeIndex === '0')) h.pick(row.dataset.productName, 1);
  }
  for (const [name, qty, size] of spec.picks || []) h.pick(name, qty, size);
  return { id: spec.id, payload: h.payload() };
}

test('注文フォームの行を index-a.html から読めている（1品×1入数の38行・最初は全部隠れている）', () => {
  const rows = parseOrderRows();
  assert.equal(rows.length, 38);
  assert.equal(rows[0].dataset.productName, '焼き小籠包');
  assert.equal(rows[37].dataset.productName, 'モンゴル茶');
  assert.equal(new Set(rows.map(r => r.dataset.productName)).size, 13);
  for (const row of rows) assert.equal(row.hidden, true, row.dataset.productName + ' は最初は隠れている');
  // 同じ「品×入数」の行が2つ無い
  assert.equal(new Set(rows.map(r => r.dataset.productName + '|' + r.dataset.sizeIndex)).size, 38);
});

test('行の並びは「品の順 → 入数の順」（明細の順番が今のHPと変わらない）', () => {
  const rows = parseOrderRows();
  const names = [...new Set(rows.map(r => r.dataset.productName))];
  assert.deepEqual(names, ['焼き小籠包', '肉焼売【生冷凍】', '肉焼売【調理済み冷凍】', '海老焼売【生冷凍】', '海老焼売【調理済み冷凍】',
    '肉にら饅頭【生冷凍】', '肉にら饅頭【調理済み冷凍】', 'ちまき', '肉まん', '角煮バーガー', 'チャーシューまん', 'ザーサイ', 'モンゴル茶']);
  let last = '';
  let index = 0;
  for (const row of rows) {
    if (row.dataset.productName !== last) { last = row.dataset.productName; index = 0; }
    assert.equal(row.dataset.sizeIndex, String(index++), row.dataset.productName);
  }
});

test('行ごとの入数・値段の持ち方（焼売など＝基準の値段×倍率／ザーサイ・モンゴル茶＝行ごとの実額）', () => {
  const rows = parseOrderRows();
  for (const row of rows) {
    const d = row.dataset;
    if (row.classList.contains('has-size')) {
      assert.match(d.multiplier, /^[123]$/);
      assert.equal(d.multiplier, String(Number(d.sizeIndex) + 1));
      assert.equal(d.sizeLabel, (Number(d.basePieces) * Number(d.multiplier)) + '個入');
      // 画面に書いてある値段は、基準の値段×倍率
      const price = Number(d.price) * Number(d.multiplier), orig = Number(d.origPrice) * Number(d.multiplier);
      assert(row.html.includes('<s>¥' + orig.toLocaleString() + '</s> → <b>¥' + price.toLocaleString() + '</b>（税込）'), d.productName + ' ' + d.sizeLabel);
    } else if (row.classList.contains('has-unit-size')) {
      assert.equal(d.multiplier, undefined);
      assert.equal(d.sizeLabel, d.unit);
      assert(row.html.includes('<s>¥' + Number(d.origPrice).toLocaleString() + '</s> → <b>¥' + Number(d.price).toLocaleString() + '</b>（税込）'));
    } else {
      assert(row.classList.contains('has-tea-size'));
      assert.equal(d.multiplier, undefined);
      assert.equal(d.sizeLabel, d.teaBags + '袋セット');
      assert(row.html.includes('¥' + Number(d.price).toLocaleString() + '（税込）'));
    }
  }
  const tea = rows.filter(r => r.classList.contains('has-tea-size')).map(r => [r.dataset.teaBags, r.dataset.price]);
  assert.deepEqual(tea, [['1', '4000'], ['2', '7500'], ['3', '10800']]);
  const zasai = rows.filter(r => r.classList.contains('has-unit-size')).map(r => [r.dataset.unit, r.dataset.price, r.dataset.origPrice]);
  assert.deepEqual(zasai, [['140g', '760', '800'], ['280g', '1520', '1600']]);
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

test('同じ品の入数違いは、明細も line_items も入数ごとの別の行になる（工場が読み違えない書き方）', () => {
  const { payload } = buildCase(NEW_CASES[0]);
  assert.deepEqual(payload.items, [
    '肉焼売【生冷凍】 4個入 × 1袋（計4個）¥760',
    '肉焼売【生冷凍】 8個入 × 2袋（計16個）¥3,040',
    '送料（福岡県宛） ¥1,200']);
  assert.equal(payload.total, '¥5,000');
  assert.deepEqual(payload.line_items, [
    { name: '肉焼売【生冷凍】', qty: 1, multiplier: 1, size: null, tea_bags: null },
    { name: '肉焼売【生冷凍】', qty: 2, multiplier: 2, size: null, tea_bags: null },
  ]);
});

test('黄金データ①：今のHPの14通りは、新しいページでも一字一句同じ注文データになる', () => {
  const old = JSON.parse(fs.readFileSync(OLD_GOLDEN_PATH, 'utf8'));
  assert.equal(old.cases.length, 14);
  assert.deepEqual(OLD_CASES.map(c => c.id), old.cases.map(c => c.id));
  assert.deepEqual(OLD_CASES.map(buildCase), old.cases);
});

test('黄金データ②：入数違い同時を足した期待値（催事アプリ側へ写す用）と一致する', () => {
  const built = { note: 'aikarou-hp tests/test_top_line_items.cjs が作る。手で直さない。先頭の14通りは line_items_golden.json と同じ',
    cases: [...OLD_CASES, ...NEW_CASES].map(buildCase) };
  if (process.env.UPDATE_GOLDEN === '1') {
    fs.mkdirSync(path.dirname(GOLDEN_PATH), { recursive: true });
    fs.writeFileSync(GOLDEN_PATH, JSON.stringify(built, null, 2) + '\n');
  }
  const golden = JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8'));
  assert.deepEqual(built, golden);
});

test('伝票・読み上げの1行は、送る明細と同じ文面（値段の前まで）', () => {
  const h = harness({ payment: 'bank' });
  for (const row of h.rows) {
    for (const qty of [1, 2, 11]) {
      for (const r of h.rows) r.querySelector('.order-qty-num').textContent = '0';
      row.querySelector('.order-qty-num').textContent = String(qty);
      const item = h.payload().items[0];
      const price = '¥' + (h.context.getRowPrice(row) * qty).toLocaleString();
      const line = h.context.getRowSlipParts(row, qty).join('');
      // 明細は「…（計8個）¥1,520」「… × 2 ¥2,960」のどちらか（値段の前の空白の有無は品の種類で決まっている）
      assert(item === line + price || item === line + ' ' + price, item + ' ≠ ' + line + ' + ' + price);
    }
  }
});

test('銀行振込でサーバーが400で断ったら、その案内文を画面に出して入力に戻す', async () => {
  const h = harness(); h.pick('肉焼売【生冷凍】', 3, '4個');
  h.submit(h.payload());
  assert.equal(h.log.requests.length, 1);
  assert.equal(h.log.requests[0].url, 'http://local.test/orders/api/hp-order');
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
  assert.equal(h.log.success.length, 0);
});

test('成功したときは従来どおり完了画面へ進む', async () => {
  const h = harness(); h.pick('肉焼売【生冷凍】', 1, '4個'); h.pick('肉焼売【生冷凍】', 2, '8個');
  const payload = h.payload();
  h.submit(payload);
  h.respond({ ok: true, status: 200, json: async () => ({ success: true }) });
  await flush();
  assert.equal(h.log.success.length, 1);
  assert.deepEqual(h.log.success[0], payload);
});

// ── ブラウザの「ページを翻訳」対策（2026-11-12 PR-4）──────────
function translateScreen(rows) {
  // 翻訳ソフトがやること＝画面の文字だけを書き換える（data- 属性は触らない）
  rows.forEach((row, i) => { row.querySelector('.order-product-name').textContent = 'Translated product ' + (i + 1); });
}

test('注文行38行すべてに data-product-name があり、画面の商品名と同じ文字', () => {
  const rows = parseOrderRows();
  assert.equal(rows.length, 38);
  for (const row of rows) {
    assert(row.dataset.productName);
    assert.equal(row.dataset.productName, row.querySelector('.order-product-name').textContent);
  }
});

test('画面の商品名が翻訳されていても、line_items の name は元の日本語のまま', () => {
  const h = harness({ payment: 'cod' });
  h.pick('肉焼売【生冷凍】', 2, '8個'); h.pick('肉焼売【生冷凍】', 1, '12個'); h.pick('ザーサイ', 1, '280g'); h.pick('モンゴル茶', 1, '3袋');
  const before = h.payload();
  translateScreen(h.rows);
  const after = h.payload();
  assert.deepEqual(after.line_items.map(item => item.name), ['肉焼売【生冷凍】', '肉焼売【生冷凍】', 'ザーサイ', 'モンゴル茶']);
  assert.deepEqual(after, before);
  assert.doesNotMatch(JSON.stringify(after), /Translated/);
});

test('全部の行を翻訳された状態で注文しても、黄金データ（全商品を1つずつ）と一致する', () => {
  const h = harness({ address: '京都府確認市' });
  translateScreen(h.rows);
  for (const row of h.rows.filter(r => r.dataset.sizeIndex === '0')) row.querySelector('.order-qty-num').textContent = '1';
  const golden = JSON.parse(fs.readFileSync(OLD_GOLDEN_PATH, 'utf8'));
  const expected = golden.cases.find(c => c.id === '全商品を1つずつ（サイズは初期のまま）');
  assert.deepEqual(h.payload(), expected.payload);
});
