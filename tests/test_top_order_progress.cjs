// 新しいトップページ（index-a.html・top.js）の、下の帯のボタン（注文へ進む／注文内容を確認する）のテスト。
// 「次に行く先」の決め方（getOrderProgressTarget）は今の app.js のまま。
// 帯の動きは A案：押せば必ず1歩先へ進む。ただし帯のボタンそのものは注文を送らない（確定は確認画面のボタンだけ）。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'top.js'), 'utf8');
const start = source.indexOf('  function getOrderProgressTarget()');
const end = source.indexOf('  // Order form logic', start);
assert(start >= 0 && end > start);

// inForm＝お客様がもう注文フォームの中にいる（選んだ品の場所が、帯より120px以上うえに見えている）
function fixture({ subtotal = 6840, missing = [], invalidEmail = false,
  emptyAddress = false, reducedMotion = false, inForm = true } = {}) {
  const effects = [];
  const fields = ['orderName', 'orderPhone', 'orderEmail', 'orderZip', 'orderAddress',
    'orderBanchi', 'orderBuilding', 'orderDelivery', 'orderPayment', 'orderNote'];
  const nodes = Object.fromEntries([...fields, 'orderSubmitBtn', 'orderTotalBox'].map(id => [id, {
    id, value: id === 'orderAddress' ? (emptyAddress ? '' : '福岡県確認市') : '確認用',
    willValidate: id !== 'orderAddress',
    validity: { valid: !missing.includes(id) && !(id === 'orderEmail' && invalidEmail) },
    closest() { return { classList: { remove(name) { effects.push(['show', name]); } } }; },
    focus(options) { effects.push(['focus', id, options.preventScroll]); },
    scrollIntoView(options) { effects.push(['scroll', id, options.behavior, options.block]); },
    getBoundingClientRect() { return { top: 300, bottom: 340 }; },
    click() { effects.push(['click', id]); },
  }]));
  nodes.orderForm = { querySelectorAll() { return fields.map(id => nodes[id]); } };
  nodes.orderItems = { getBoundingClientRect() { return { top: inForm ? 100 : 900 }; },
    scrollIntoView(options) { effects.push(['scroll', 'orderItems', options.behavior, options.block]); } };
  nodes.floatingCart = { offsetHeight: 96, getBoundingClientRect() { return { top: 660 }; },
    classList: { contains: () => false, toggle() {} }, querySelector: () => null };
  const timers = [];
  const context = {
    document: { getElementById: id => nodes[id], querySelector: () => null, documentElement: { style: { setProperty() {} } } },
    window: { innerWidth: 390, innerHeight: 760, addEventListener() {} },
    setTimeout(fn) { timers.push(fn); },
    getOrderSubtotal: () => subtotal,
    MIN_ORDER_SUBTOTAL: 2000,
    prefersReducedMotion: () => reducedMotion,
    // 帯のボタンが自分で送信・決済を始めた場合はテストを失敗させる。
    handleOrderSubmit() { throw new Error('must not submit'); },
    confirmReviewedOrder() { throw new Error('must not confirm'); },
    submitReviewedOrder() { throw new Error('must not send'); },
    fetch() { throw new Error('must not send'); },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  return { target: () => context.getOrderProgressTarget().id, effects, timers,
    inForm: () => context.isOrderFormInView(),
    click() { context.proceedToOrder({ preventDefault() { effects.push(['preventDefault']); } }); } };
}

// ── 次に行く先の決め方（今のHPと同じ）──
test('商品選択後は最初の未入力欄へ案内する', () => {
  assert.equal(fixture({ missing: ['orderName', 'orderPhone', 'orderZip', 'orderBanchi'] }).target(), 'orderName');
});
test('名前の入力済みなら電話番号へ進む', () => {
  assert.equal(fixture({ missing: ['orderPhone', 'orderBanchi'] }).target(), 'orderPhone');
});
test('任意メールアドレスの形式エラーを見落とさない', () => {
  assert.equal(fixture({ invalidEmail: true }).target(), 'orderEmail');
});
test('自動取得住所がまだ空なら編集できる郵便番号へ戻す', () => {
  assert.equal(fixture({ emptyAddress: true }).target(), 'orderZip');
});
test('最低注文額未満なら金額と最低注文額の案内へ移動する', () => {
  assert.equal(fixture({ subtotal: 1999 }).target(), 'orderTotalBox');
  assert.equal(fixture({ subtotal: 2000, missing: ['orderName'] }).target(), 'orderName');
});
test('必須欄が全部入っていれば、行く先は「注文内容を確認する」のボタン', () => {
  assert.equal(fixture().target(), 'orderSubmitBtn');
});

// ── 帯のボタンの動き（A案：押せば必ず1歩先へ）──
test('まだメニューにいる時は、リンクのまま「商品と数量」へ行く（欄へは飛ばさない）', () => {
  const page = fixture({ inForm: false, missing: ['orderName'] });
  assert.equal(page.inForm(), false);
  page.click();
  assert.deepEqual(page.effects, []);          // preventDefault しない＝ href="#orderItems" のリンクが働く
  // なめらかな移動が途中で止まった時の保険：少し待って、着いていなければ直接移す
  assert.equal(page.timers.length, 1);
  page.timers[0]();
  assert.deepEqual(page.effects, [['scroll', 'orderItems', 'auto', 'start']]);
});
test('注文フォームの中では、最初の空き欄へ（カーソルも入る）', () => {
  const page = fixture({ missing: ['orderBanchi'] });
  assert.equal(page.inForm(), true);
  page.click();
  assert.deepEqual(page.effects, [['preventDefault'], ['show', 'wait'],
    ['focus', 'orderBanchi', true], ['scroll', 'orderBanchi', 'smooth', 'center']]);
});
test('合計が足りない時は合計の伝票へ（カーソルは動かさない）', () => {
  const page = fixture({ subtotal: 1999 });
  page.click();
  assert.deepEqual(page.effects, [['preventDefault'], ['show', 'wait'], ['scroll', 'orderTotalBox', 'smooth', 'center']]);
});
test('全部埋まっていれば「注文内容を確認する」を押したのと同じ（確認画面への道。帯は自分では送らない）', () => {
  const page = fixture();
  page.click();
  assert.deepEqual(page.effects, [['preventDefault'], ['click', 'orderSubmitBtn']]);
});
test('動きを減らす設定では即時移動する', () => {
  const page = fixture({ reducedMotion: true, missing: ['orderName'] });
  page.click();
  assert.equal(page.effects[3][2], 'auto');
});
test('HTMLは通常リンクのフォールバックと送信の独立性を保つ', () => {
  const html = fs.readFileSync(path.join(root, 'index-a.html'), 'utf8');
  assert.match(html, /<a class="btn btn-red" href="#orderItems" onclick="proceedToOrder\(event\)"><span class="cb-t">注文へ進む<\/span>/);
  assert.match(html, /<button type="submit" class="submit" id="orderSubmitBtn" disabled>注文内容を確認する<\/button>/);
  assert.match(html, /id="orderTotalBox" aria-label="合計金額" tabindex="-1"/);
  assert.match(html, /<h3 class="step" id="orderItems">商品と数量<\/h3>/);
  // 確定のボタンは確認画面の中にだけある
  assert.equal(html.split('confirmReviewedOrder()').length - 1, 1);
});
