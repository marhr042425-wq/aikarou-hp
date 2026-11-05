const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const start = source.indexOf('  function getOrderProgressTarget()');
const end = source.indexOf('  // Order form logic', start);
assert(start >= 0 && end > start);

function fixture({ subtotal = 6840, missing = [], invalidEmail = false,
  emptyAddress = false, reducedMotion = false } = {}) {
  const effects = [];
  const fields = ['orderName', 'orderPhone', 'orderEmail', 'orderZip', 'orderAddress',
    'orderBanchi', 'orderBuilding', 'orderDelivery', 'orderPayment', 'orderNote'];
  const nodes = Object.fromEntries([...fields, 'orderSubmitBtn', 'orderTotalBox'].map(id => [id, {
    id, value: id === 'orderAddress' ? (emptyAddress ? '' : '福岡県確認市') : '確認用',
    willValidate: id !== 'orderAddress',
    validity: { valid: !missing.includes(id) && !(id === 'orderEmail' && invalidEmail) },
    closest() { return { classList: { add(name) { effects.push(['show', name]); } } }; },
    focus(options) { effects.push(['focus', id, options.preventScroll]); },
    scrollIntoView(options) { effects.push(['scroll', id, options.behavior, options.block]); },
  }]));
  nodes.orderForm = { querySelectorAll() { return fields.map(id => nodes[id]); } };
  const context = {
    document: { getElementById: id => nodes[id] },
    getOrderSubtotal: () => subtotal,
    MIN_ORDER_SUBTOTAL: 2000,
    prefersReducedMotion: () => reducedMotion,
    // 誤って送信・決済を始めた場合はテストを失敗させる。
    handleOrderSubmit() { throw new Error('must not submit'); },
    fetch() { throw new Error('must not send'); },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  return { target: () => context.getOrderProgressTarget().id, effects,
    click() { context.proceedToOrder({ preventDefault() { effects.push(['preventDefault']); } }); } };
}

test('商品選択後は最初の未入力欄へ案内する', () => {
  assert.equal(fixture({ missing: ['orderName', 'orderPhone', 'orderZip', 'orderBanchi'] }).target(), 'orderName');
});
test('名前の入力済みなら電話番号へ進む', () => {
  assert.equal(fixture({ missing: ['orderPhone', 'orderBanchi'] }).target(), 'orderPhone');
});
test('画像と同じく住所まで入力済みなら番地へ進む', () => {
  const page = fixture({ missing: ['orderBanchi'] });
  page.click();
  assert.deepEqual(page.effects, [['preventDefault'], ['show', 'visible'],
    ['focus', 'orderBanchi', true], ['scroll', 'orderBanchi', 'smooth', 'center']]);
});
test('必須欄入力済みなら送信ボタンへ移動し、自動送信しない', () => {
  const page = fixture();
  page.click();
  assert.equal(page.target(), 'orderSubmitBtn');
  assert.equal(page.effects[2][1], 'orderSubmitBtn');
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
test('動きを減らす設定では即時移動する', () => {
  const page = fixture({ reducedMotion: true });
  page.click();
  assert.equal(page.effects[3][2], 'auto');
});
test('HTMLは通常リンクのフォールバックと送信の独立性を保つ', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /class="floating-cart-btn" href="#orderForm" onclick="proceedToOrder\(event\)"/);
  assert.match(html, /<button type="submit" class="order-submit-btn" id="orderSubmitBtn"/);
  assert.match(html, /id="orderTotalBox" tabindex="-1"/);
});
