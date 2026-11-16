const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function segment(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert(a >= 0 && b > a, start);
  return source.slice(a, b);
}
const code = [
  'let reviewedOrder = null, orderSubmissionInProgress = false, shippingAddressPending = false;',
  segment('  function getRowMultiplier(row)', '  // その行の「1袋あたりの個数」'),
  segment('  const FREE_SHIPPING_LINE', '  function getStripe()'),
  segment('  function getOrderTotalNum()', '  function useAllPoints()'),
  segment('  function buildOrderPayload()', '  function showOrderCompleteScreen('),
  segment('  const CARD_INCOMPLETE_MSG', '  async function mountCardPaymentElement('),
  segment('  const SHIPPING_DEFAULT_NOTE', '  function resetOrderForm()'),
].join('\n');

class Node {
  constructor(id = '') {
    this.id = id; this.value = ''; this.children = []; this.textContent = '';
    this.style = {}; this.disabled = false; this.open = false; this.listeners = {};
    this.attributes = new Map();
    const classes = new Set();
    this.classList = { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x) };
  }
  appendChild(child) { this.children.push(child); return child; }
  get textContent() { return this.text || ''; }
  set textContent(value) { this.text = value; this.children = []; }
  setAttribute(name, value) { this.attributes.set(name, value); if (name === 'open') this.open = true; }
  removeAttribute(name) { this.attributes.delete(name); if (name === 'open') this.open = false; }
  hasAttribute(name) { return this.attributes.has(name); }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  focus() { this.focused = true; }
  select() { this.selected = true; }
  scrollIntoView() { this.scrolled = true; }
  showModal() { this.setAttribute('open', ''); }
  close() { this.removeAttribute('open'); this.listeners.close?.(); }
  get innerHTML() { return ''; }
  set innerHTML(_) { throw new Error('review must render text, not HTML'); }
}
function textOf(node) { return node.textContent + node.children.map(textOf).join('\n'); }

function harness({ payment = 'bank', address = '福岡県確認市', points = 0, nativeDialog = true,
  balance = 1000, pointBoxShown = true } = {}) {
  const nodes = new Map();
  const node = id => { if (!nodes.has(id)) nodes.set(id, new Node(id)); return nodes.get(id); };
  const log = { orders: [], payments: 0, mounts: 0, preparations: 0, alerts: [], success: [], errors: [] };
  let resolveOrder, rejectOrder, resolvePayment;
  const row = { dataset: { price: '1000', unit: '1袋' },
    classList: { contains: () => false },
    querySelector: selector => selector === '.order-qty-num' ? node('qty') : node('productName') };
  node('qty').textContent = '3'; node('productName').textContent = '確認商品';
  const values = { orderName: '確認用のお客様', orderPhone: '00000000000', orderEmail: '',
    orderZip: '811-3209', orderAddress: address, orderBanchi: '1-2-3', orderBuilding: '',
    orderDelivery: 'yamato', orderPayment: payment, orderDate: '', orderNote: '',
    orderMemberId: '', pointUseAmount: String(points) };
  for (const [id, value] of Object.entries(values)) node(id).value = value;
  // ポイントの枠は、照会で残高が見つかったときだけ表示される（lookupPoints / hidePointUseBox と同じ状態）。
  node('pointUseBox').style.display = pointBoxShown ? '' : 'none';
  let valid = true;
  node('orderForm').checkValidity = () => valid;
  node('orderForm').reportValidity = () => { node('orderForm').reported = true; return valid; };
  const document = { getElementById: node, createElement: () => new Node(),
    querySelectorAll: () => [row], body: new Node('body') };
  if (!nativeDialog) {
    node('orderReviewDialog').showModal = undefined;
    node('orderReviewDialog').close = undefined;
  }
  const context = { document, customerPoints: balance, MIN_POINT_USE: 50, TEA_PIECES_PER_BAG: 30,
    PAYMENT_RETURN_URL: 'http://127.0.0.1/order-complete/',
    alert: msg => log.alerts.push(msg), updateFloatingCart() {}, applyPointDiscount() {}, scheduleCardRemount() {},
    showCardError: msg => log.errors.push(msg),
    updateCardPaymentUI: () => { log.preparations++; },
    unmountCardPaymentElement() {},
    async mountCardPaymentElement() { log.mounts++; },
    getStripe: () => ({ confirmPayment: () => {
      log.payments++;
      return new Promise(resolve => { resolvePayment = resolve; });
    } }),
    fetch(url, options) {
      log.orders.push({ url, payload: JSON.parse(options.body) });
      return new Promise((resolve, reject) => { resolveOrder = resolve; rejectOrder = reject; });
    },
    showOrderCompleteScreen(payload) { log.success.push(payload); context.hideOrderProcessingOverlay(); },
    showOrderCompletePending(payload) { log.success.push(payload); context.hideOrderProcessingOverlay(); },
  };
  vm.createContext(context); vm.runInContext(code, context);
  function readyCard(overrides = {}) {
    context.updateTotal();
    context.quote = { amount: context.getOrderTotalNum() - context.buildOrderPayload().use_points,
      orderTotal: context.getOrderTotalNum(), pointsUsed: context.buildOrderPayload().use_points, ...overrides };
    vm.runInContext('stripePaymentElement = {}; mountedPayloadJson = JSON.stringify(buildOrderPayload()); cardChargeQuote = quote;', context);
  }
  return { node, row, log, context, readyCard,
    open() { context.handleOrderSubmit({ preventDefault() {} }); },
    confirm() { context.confirmReviewedOrder(); },
    back() { context.closeOrderReview(); },
    valid(value) { valid = value; },
    pending(value) { context.pending = value; vm.runInContext('shippingAddressPending = pending;', context); },
    summary() { return textOf(node('orderReviewSummary')); },
    // 確認画面の中のボタン（＝ポイント案内のボタン）を全部拾う
    guideButtons() {
      const found = [];
      (function walk(n) { if (n.listeners.click) found.push(n); n.children.forEach(walk); })(node('orderReviewSummary'));
      return found;
    },
    pressGuide() { this.guideButtons()[0].listeners.click(); },
    busy() { return vm.runInContext('orderSubmissionInProgress', context); },
    resolveOrder(value = {}) { resolveOrder({ ok: true, json: async () => value }); },
    failOrder() { rejectOrder(new Error('simulated network failure')); },
    resolvePayment(value) { resolvePayment(value); },
  };
}
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }

test('最初のクリックでは明細を表示し、注文も支払いも送らない', () => {
  const h = harness(); h.open();
  assert.equal(h.node('orderReviewDialog').open, true);
  assert.match(h.summary(), /確認商品 × 3（1袋） ¥3,000/);
  assert.match(h.summary(), /¥4,200/);
  assert.match(h.summary(), /銀行振込/);
  assert.match(h.summary(), /811-3209/);
  assert.match(h.summary(), /1-2-3/);
  assert.equal(h.node('orderReviewTitle').focused, true);
  assert.equal(h.log.orders.length, 0); assert.equal(h.log.payments, 0);
});
test('戻る・Escapeでは内容を保持し、再度確定を呼んでも送らない', () => {
  const h = harness(); h.open(); h.back(); h.confirm();
  assert.equal(h.node('orderName').value, '確認用のお客様');
  assert.equal(h.node('qty').textContent, '3');
  assert.equal(h.log.orders.length, 0);
  h.open();
  h.node('orderReviewDialog').listeners.cancel({ preventDefault() {} });
  assert.equal(h.node('orderReviewDialog').open, false);
  assert.equal(h.context.document.body.classList.contains('order-review-open'), false);
  assert.equal(h.context.document.body.classList.contains('order-review-inline-open'), false);
  h.confirm(); assert.equal(h.log.orders.length, 0);
});
test('最終確定だけが確認した内容を1回送り、連打やEnterを止める', async () => {
  const h = harness(); h.open(); h.confirm(); h.confirm(); h.open();
  assert.equal(h.log.orders.length, 1); assert.equal(h.busy(), true);
  assert.equal(h.log.orders[0].payload.total, '¥4,200');
  h.context.updateTotal(); assert.equal(h.node('orderSubmitBtn').disabled, true);
  h.resolveOrder(); await flush(); assert.equal(h.log.success.length, 1);
});
test('送信失敗後は確認ボタンへ戻り、再確認してから再送できる', async () => {
  const h = harness(); h.open(); h.confirm(); h.failOrder(); await flush();
  assert.equal(h.busy(), false);
  assert.equal(h.node('orderSubmitBtn').textContent, '注文内容を確認する');
  h.confirm(); assert.equal(h.log.orders.length, 1);
  h.open(); assert.equal(h.log.orders.length, 1);
  h.confirm(); assert.equal(h.log.orders.length, 2);
});
test('入力不備・最低金額未満・住所未確定では確認へ進まない', () => {
  for (const change of [h => h.valid(false), h => { h.node('qty').textContent = '1'; },
    h => { h.node('orderAddress').value = ''; }, h => h.pending(true)]) {
    const h = harness(); change(h); h.open(); h.confirm();
    assert.equal(h.node('orderReviewDialog').open, false);
    assert.equal(h.log.orders.length, 0); assert.equal(h.log.payments, 0);
  }
});
test('任意メールなど確認後の入力不備も送信せず元の欄へ戻す', () => {
  const h = harness(); h.open(); h.valid(false); h.confirm();
  assert.equal(h.node('orderReviewDialog').open, false);
  assert.equal(h.node('orderForm').reported, true);
  assert.equal(h.log.orders.length, 0);
});
for (const [label, change] of [
  ['数量', h => { h.node('qty').textContent = '4'; }],
  ['価格同期', h => { h.row.dataset.price = '1100'; }],
  ['番地', h => { h.node('orderBanchi').value = '4-5-6'; }],
  ['ポイント', h => { h.node('pointUseAmount').value = '200'; }],
  ['支払い方法', h => { h.node('orderPayment').value = 'cod'; }],
]) test(`確認中の${label}変更は内容を更新して再確認を求める`, () => {
  const h = harness(); h.open(); change(h); h.confirm();
  assert.equal(h.log.orders.length, 0);
  assert.match(h.node('orderReviewChanged').textContent, /変わりました/);
  h.confirm(); assert.equal(h.log.orders.length, 1);
});
test('ポイント割引・代引き手数料を含めた支払額を表示する', () => {
  const h = harness({ payment: 'cod', points: 200 }); h.open();
  assert.match(h.summary(), /代引き手数料/); assert.match(h.summary(), /¥330/);
  assert.match(h.summary(), /200pt/); assert.match(h.summary(), /¥4,330/);
});
test('別途送料・代引き手数料を0円や確定済みと誤表示しない', () => {
  const h = harness({ payment: 'cod', address: '北海道確認市' }); h.open();
  assert.match(h.summary(), /送料・代引き手数料は上記金額に含まれていません/);
  assert.equal(h.node('orderConfirmBtn').textContent, '送料別途で注文を確定する');
});
test('名前・住所・備考の記号はHTMLとして解釈せず文字で表示する', () => {
  const h = harness(); h.node('orderName').value = '<確認 & お客様>';
  h.node('orderNote').value = '<img src=x onerror=alert(1)>'; h.open();
  assert.match(h.summary(), /<確認 & お客様>/); assert.match(h.summary(), /<img src=x/);
});
test('カードはサーバー請求額を確認画面と最終ボタンに出す', () => {
  const h = harness({ payment: 'credit', points: 200 }); h.readyCard(); h.open();
  assert.equal(h.node('orderConfirmBtn').textContent, '¥4,000を支払う');
  assert.equal(h.log.payments, 0); assert.equal(h.log.orders.length, 0);
  h.confirm(); h.confirm(); h.open();
  assert.equal(h.log.payments, 1); assert.equal(h.log.orders.length, 0);
});
test('カード情報不備で失敗しても通常注文へ流さず、再確認が必要', async () => {
  const h = harness({ payment: 'credit' }); h.readyCard(); h.open(); h.confirm();
  h.resolvePayment({ error: { type: 'validation_error' } }); await flush();
  assert.equal(h.busy(), false); assert.equal(h.log.orders.length, 0);
  h.confirm(); assert.equal(h.log.payments, 1);
  h.open(); h.confirm(); assert.equal(h.log.payments, 2);
});
test('カード成功は既存の決済確認中の画面へ進む', async () => {
  const h = harness({ payment: 'credit' }); h.readyCard(); h.open(); h.confirm();
  h.resolvePayment({ paymentIntent: { status: 'processing' } }); await flush();
  assert.equal(h.log.success.length, 1); assert.equal(h.log.orders.length, 0);
});
test('カード準備未完了・請求額やポイント不一致では支払えない', () => {
  for (const quote of [null, { amount: 1 }, { orderTotal: 1 }, { pointsUsed: 1 }]) {
    const h = harness({ payment: 'credit' }); if (quote) h.readyCard(quote);
    h.open(); h.confirm();
    assert.equal(h.node('orderReviewDialog').open, false);
    assert.equal(h.log.payments, 0); assert.equal(h.log.orders.length, 0);
  }
});
test('確認後にカード請求額が変わっても旧内容で支払えない', () => {
  const h = harness({ payment: 'credit' }); h.readyCard(); h.open();
  h.readyCard({ amount: 1 }); h.confirm();
  assert.equal(h.node('orderReviewDialog').open, false);
  assert.equal(h.log.payments, 0);
});
test('別途送料の地域でカード決済を確定しない', () => {
  const h = harness({ payment: 'credit', address: '沖縄県確認市' }); h.readyCard(); h.open();
  assert.equal(h.node('orderReviewDialog').open, false); assert.equal(h.log.payments, 0);
});

test('showModalとcloseがない端末でも確認画面を開くだけでは送信しない', () => {
  const h = harness({ nativeDialog: false }); h.open();
  assert.equal(h.node('orderReviewDialog').hasAttribute('open'), true);
  assert.equal(h.node('orderReviewDialog').classList.contains('order-review-inline'), true);
  assert.equal(h.context.document.body.classList.contains('order-review-open'), false);
  assert.equal(h.context.document.body.classList.contains('order-review-inline-open'), true);
  assert.match(h.summary(), /確認商品 × 3/);
  assert.match(h.summary(), /¥4,200/);
  assert.equal(h.log.orders.length, 0); assert.equal(h.log.payments, 0);
});
test('未対応端末でも戻る操作は入力を残し、確定を呼んでも送信しない', () => {
  const h = harness({ nativeDialog: false }); h.open(); h.back(); h.confirm();
  assert.equal(h.node('orderReviewDialog').hasAttribute('open'), false);
  assert.equal(h.context.document.body.classList.contains('order-review-inline-open'), false);
  assert.equal(h.node('orderSubmitBtn').focused, true);
  assert.equal(h.node('orderName').value, '確認用のお客様');
  assert.equal(h.log.orders.length, 0);
});
test('未対応端末でも最終確定だけが1回送信し、連打を止める', () => {
  const h = harness({ nativeDialog: false }); h.open(); h.confirm(); h.confirm(); h.open();
  assert.equal(h.log.orders.length, 1); assert.equal(h.log.payments, 0);
  assert.equal(h.log.orders[0].payload.total, '¥4,200');
});
test('未対応端末でもカードの確認後にだけ1回支払いを確定する', () => {
  const h = harness({ nativeDialog: false, payment: 'credit' }); h.readyCard(); h.open();
  assert.equal(h.log.payments, 0); assert.equal(h.log.orders.length, 0);
  h.confirm(); h.confirm(); assert.equal(h.log.payments, 1); assert.equal(h.log.orders.length, 0);
});
test('未対応端末でも金額変更後は再確認し、古い明細を重複表示しない', () => {
  const h = harness({ nativeDialog: false }); h.open(); h.node('qty').textContent = '4'; h.confirm();
  assert.equal(h.log.orders.length, 0);
  assert.match(h.node('orderReviewChanged').textContent, /変わりました/);
  assert.doesNotMatch(h.summary(), /確認商品 × 3/);
  assert.match(h.summary(), /確認商品 × 4/);
  h.confirm(); assert.equal(h.log.orders.length, 1);
});

// ===== 確認画面の「ポイントを使う」案内（2026-11-16 案1） =====
const GUIDE_TEXT = /ポイントが 1,000pt あります（50ptからご利用いただけます）/;
test('ポイント案内：未利用で残高が50pt以上なら、残高つきの案内とボタンを1つ出す', () => {
  const h = harness(); h.open();
  assert.match(h.summary(), /利用なし/);
  assert.match(h.summary(), GUIDE_TEXT);
  assert.equal(h.guideButtons().length, 1);
  assert.equal(h.guideButtons()[0].textContent, 'ポイントを使う');
  assert.equal(h.guideButtons()[0].type, 'button');
  assert.equal(h.log.orders.length, 0); assert.equal(h.log.payments, 0);
});
test('ポイント案内：ちょうど50ptは出す・49ptは出さない', () => {
  const at = harness({ balance: 50 }); at.open();
  assert.match(at.summary(), /ポイントが 50pt あります（50ptからご利用いただけます）/);
  assert.equal(at.guideButtons().length, 1);
  const below = harness({ balance: 49 }); below.open();
  assert.doesNotMatch(below.summary(), /あります/);
  assert.equal(below.guideButtons().length, 0);
});
for (const [label, options] of [
  ['未照会・照会失敗・該当なし（残高0・枠は非表示）', { balance: 0, pointBoxShown: false }],
  ['残高はあるが枠が出ていない', { balance: 1000, pointBoxShown: false }],
  ['すでにポイントを使っている', { points: 200 }],
  ['すでにポイントを使っている（代引き）', { points: 200, payment: 'cod' }],
]) test(`ポイント案内：${label}ときは何も出さない`, () => {
  const h = harness(options); h.open();
  assert.equal(h.node('orderReviewDialog').open, true);
  assert.doesNotMatch(h.summary(), /あります/);
  assert.doesNotMatch(h.summary(), /ポイントを使う/);
  assert.equal(h.guideButtons().length, 0);
});
test('ポイント案内：案内を出しても金額と送る内容は変わらない', () => {
  const shown = harness(); shown.open();
  const hidden = harness({ balance: 0, pointBoxShown: false }); hidden.open();
  assert.match(shown.summary(), /¥4,200/);
  assert.equal(shown.node('orderConfirmBtn').textContent, hidden.node('orderConfirmBtn').textContent);
  shown.confirm(); hidden.confirm();
  assert.deepEqual(shown.log.orders, hidden.log.orders);
  assert.equal(shown.log.orders[0].payload.use_points, 0);
});
test('ポイント案内：ボタンは「戻って修正する」と同じ閉じ方をして、ポイントの枠へ案内する', () => {
  const viaBack = harness(); viaBack.open(); viaBack.back();
  const h = harness(); h.open(); h.pressGuide();
  for (const id of ['orderReviewDialog']) assert.equal(h.node(id).open, viaBack.node(id).open);
  assert.equal(h.node('orderReviewDialog').open, false);
  assert.equal(h.context.document.body.classList.contains('order-review-open'), false);
  assert.equal(h.context.document.body.classList.contains('order-review-inline-open'), false);
  // 入力はそのまま・ポイント数は勝手に入れない
  assert.equal(h.node('orderName').value, '確認用のお客様');
  assert.equal(h.node('qty').textContent, '3');
  assert.equal(h.node('pointUseAmount').value, '0');
  // ポイントの枠を見える位置に出し、入力欄にカーソルを置く
  assert.equal(h.node('pointUseBox').scrolled, true);
  assert.equal(h.node('pointUseAmount').focused, true);
  // 入っている「0」を選んだ状態にする（打った数字がそのまま入るように）。値は変えない
  assert.equal(h.node('pointUseAmount').selected, true);
  assert.equal(h.node('pointUseAmount').value, '0');
  // 閉じたあとは確定を呼んでも何も送らない（戻るボタンと同じ）
  h.confirm(); viaBack.confirm();
  assert.equal(h.log.orders.length, 0); assert.equal(h.log.payments, 0);
  assert.equal(viaBack.log.orders.length, 0);
});
test('ポイント案内：ボタンの処理は既存の closeOrderReview をそのまま呼ぶ', () => {
  const body = segment('  function goToPointUseFromReview()', '  const orderReviewDialog');
  assert.match(body, /function goToPointUseFromReview\(\) \{\n\s+closeOrderReview\(\);/);
  // 金額・送信・決済・Stripeの入力欄には触れない
  assert.doesNotMatch(body, /fetch|updateTotal|applyPointDiscount|useAllPoints|\.value\s*=|mountCard|unmountCard|confirmPayment|submitReviewedOrder/);
});
test('ポイント案内：戻ってポイントを入れると、再確認に割引が出て案内は消える', () => {
  const h = harness(); h.open(); h.pressGuide();
  h.node('pointUseAmount').value = '200'; h.open();
  assert.match(h.summary(), /200pt/); assert.match(h.summary(), /¥4,000/);
  assert.doesNotMatch(h.summary(), /あります/);
  assert.equal(h.guideButtons().length, 0);
  h.confirm();
  assert.equal(h.log.orders.length, 1);
  assert.equal(h.log.orders[0].payload.use_points, 200);
});
test('ポイント案内：未対応端末（フォーム直下の確認）でも同じ動き', () => {
  const h = harness({ nativeDialog: false }); h.open();
  assert.match(h.summary(), GUIDE_TEXT);
  h.pressGuide();
  assert.equal(h.node('orderReviewDialog').hasAttribute('open'), false);
  assert.equal(h.node('orderReviewDialog').classList.contains('order-review-inline'), false);
  assert.equal(h.context.document.body.classList.contains('order-review-inline-open'), false);
  assert.equal(h.node('pointUseBox').scrolled, true);
  assert.equal(h.node('pointUseAmount').focused, true);
  h.confirm(); assert.equal(h.log.orders.length, 0);
});
test('ポイント案内：入力欄を選べない端末でも止まらず、カーソルは置く', () => {
  const h = harness(); h.open();
  h.node('pointUseAmount').select = () => { throw new Error('select unsupported'); };
  h.pressGuide();
  assert.equal(h.node('orderReviewDialog').open, false);
  assert.equal(h.node('pointUseAmount').focused, true);
});
test('ポイント案内：開いている間に枠が消えていたら、閉じるだけで飛ばない', () => {
  const h = harness(); h.open();
  h.node('pointUseBox').style.display = 'none';
  h.pressGuide();
  assert.equal(h.node('orderReviewDialog').open, false);
  assert.equal(h.node('pointUseBox').scrolled, undefined);
  assert.equal(h.node('pointUseAmount').focused, undefined);
});
test('ポイント案内（カード）：戻ってポイントを入れたら、請求額を取り直すまで支払えない', () => {
  const h = harness({ payment: 'credit' }); h.readyCard(); h.open();
  assert.match(h.summary(), GUIDE_TEXT);
  assert.equal(h.node('orderConfirmBtn').textContent, '¥4,200を支払う');
  h.pressGuide();
  assert.equal(h.log.payments, 0);
  h.node('pointUseAmount').value = '200';
  // 古い請求額（ポイントなし¥4,200）のままでは確認画面を開かず、お支払い欄の作り直しへ回す（既存の守り）
  h.open();
  assert.equal(h.node('orderReviewDialog').open, false);
  assert.equal(h.log.preparations, 1);
  assert.equal(h.log.errors.length, 1);
  h.confirm(); assert.equal(h.log.payments, 0);
  // 請求額を取り直したあとは、割引後の金額で確認→支払い
  h.readyCard(); h.open();
  assert.equal(h.node('orderReviewDialog').open, true);
  assert.equal(h.node('orderConfirmBtn').textContent, '¥4,000を支払う');
  assert.equal(h.guideButtons().length, 0);
  h.confirm(); h.confirm();
  assert.equal(h.log.payments, 1); assert.equal(h.log.orders.length, 0);
});
