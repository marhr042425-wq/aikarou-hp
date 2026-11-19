// 新しいトップページ（index-a.html・top.css・top.js）の見張り。
// 掛け替えの日まで、今のHP（index.html・app.js）と食い違っていないこと／壊してはいけない物が揃っていることを見る。
//   ・top.js が探す部品（id）・HTMLから呼ぶ関数が全部ある
//   ・検索用の情報（title・説明・canonical・OGP・構造化データ）が今のHPと一字一句同じ
//   ・アレルゲン・値段が今のHPと同じ
//   ・書かない言葉・絵文字が無い／外の部品を勝手に読み込んでいない
//   ・つなぎ先（HP_CONFIG）：aikaro.jp 以外で開いたら本番へつながない
//   ・掛け替えの印（検索除外・見るだけの守り）
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const exists = name => fs.existsSync(path.join(root, name));
// 掛け替えの後は、新しいページは index.html になる（index-a.html は無くなる）。どちらの名前でも同じ見張りが働く。
const PAGE = exists('index-a.html') ? 'index-a.html' : 'index.html';
const html = read(PAGE);
const js = read('top.js');
const css = read('top.css');
const swapped = PAGE === 'index.html';
const old = swapped ? null : read('index.html');   // 今のHP（掛け替え前だけ比べる）

const strip = s => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

test('新しいページは top.css・top.js を読み、今の styles.css・app.js は読まない', () => {
  assert.match(html, /<link rel="stylesheet" href="top\.css\?v=\d+[a-z]?">/);
  assert.match(html, /<script src="top\.js\?v=\d+[a-z]?" defer><\/script>/);
  assert.doesNotMatch(html, /styles\.css|app\.js/);
});

test('top.js が探す部品（id）が全部HTMLにある', () => {
  const ids = new Set([...js.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]));
  assert(ids.size > 50, 'id の数: ' + ids.size);
  // paymentNote は今の app.js にもある「使っていない控え」（今のHPのHTMLにも無い）。お金の関数を写したままにするため残してある。
  const missing = [...ids].filter(id => id !== 'paymentNote' && !new RegExp('\\sid="' + id + '"').test(html));
  assert.deepEqual(missing, []);
});

test('HTMLから呼ぶ関数（onclick など）が全部 top.js にある', () => {
  const called = new Set([...html.matchAll(/\son(?:click|submit|change|input)="([^"]+)"/g)]
    .flatMap(m => [...m[1].matchAll(/([A-Za-z_]\w*)\(/g)].map(x => x[1])));
  assert(called.size >= 12, [...called].join(','));
  const missing = [...called].filter(name => !new RegExp('\\n  (?:async )?function ' + name + '\\(').test(js));
  assert.deepEqual(missing, []);
});

test('壊してはいけない部品：Stripe の読み込み・お支払い欄・特商法・GA4', () => {
  assert.match(html, /<script src="https:\/\/js\.stripe\.com\/v3\/"><\/script>/);
  for (const id of ['payment-element', 'cardPaymentBox', 'cardPaymentError', 'cardChargeAmount', 'orderErrorBox',
    'orderReviewDialog', 'orderReviewChanged', 'orderConfirmBtn', 'orderCodFee', 'codOption', 'pointUseBox',
    'pointDiscountInfo', 'pointDiscountText', 'pointResult', 'pointBalanceNum', 'pointBalanceLabel',
    'pointLineLinkBox', 'pointLineLinkBtn', 'scheduleContainer', 'orderCompleteLineLink']) {
    assert.match(html, new RegExp('\\sid="' + id + '"'), id);
  }
  assert.match(html, /<a href="\/tokushoho\.html">特定商取引法に基づく表記<\/a>/);
  assert.match(html, /G-H5MT5P6XZH/);
  assert.match(html, /gtag\('config', 'G-H5MT5P6XZH'\)/);
  // ページ内の行き先（サブページの「通販で注文」は /#orderform へ来る）
  for (const id of ['top', 'about', 'featured', 'menu', 'orderform', 'cooking', 'schedule', 'order', 'contact']) {
    assert.match(html, new RegExp('<section[^>]*\\sid="' + id + '"'), id);
  }
});

test('お支払い方法の最初の選択は「クレジットカード・PayPay」。代金引換は最初は隠してある', () => {
  assert.match(html, /<option value="credit" selected>クレジットカード・PayPay<\/option>/);
  assert.match(html, /<option value="cod" id="codOption" style="display:none" disabled>代金引換（クロネコヤマト）<\/option>/);
  assert.match(html, /<option value="bank">銀行振込<\/option>/);
  // 最初の1回、今のHPの決まり（updatePaymentOptions）で出し分けを作る
  assert.match(js, /\n  updatePaymentOptions\(\);\n$/);
});

test('催事アプリの毎日の健康診断が見る物：「愛華楼」「肉焼売」・canonical と og:url が aikaro.jp', () => {
  assert(html.includes('愛華楼') && html.includes('肉焼売'));
  assert.match(html, /<link rel="canonical" href="https:\/\/aikaro\.jp\/">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/aikaro\.jp\/">/);
});

test('検索用の情報（title〜構造化データ）は今のHPと一字一句同じ', { skip: swapped && '掛け替え後は比べる相手が無い' }, () => {
  const block = s => s.slice(s.indexOf('<title>'), s.indexOf('</script>', s.indexOf('application/ld+json')) + 9);
  assert(block(old).includes('"@type": "Restaurant"'));
  assert.equal(block(html), block(old));
  assert.match(html, /<title>本格中華 愛華楼 \| 本格点心をご家庭でも<\/title>/);
});

test('掛け替えの印：隠しページの間は検索除外と「見るだけ」の守りが両方ある／掛け替え後は両方無い', () => {
  const noindex = /<meta name="robots" content="noindex/.test(html);
  const preview = /<meta name="aikaro-preview"/.test(html);
  if (swapped) {
    assert.equal(noindex, false, 'index.html に検索除外（noindex）が残っている');
    assert.equal(preview, false, 'index.html に「見るだけ」の守り（aikaro-preview）が残っている＝注文できない');
  } else {
    assert.equal(noindex, true, '隠しページに検索除外（noindex）が無い');
    assert.equal(preview, true, '隠しページに「見るだけ」の守り（aikaro-preview）が無い');
  }
});

// ── 今のHPと同じ中身（掛け替え前だけ比べる）──
function oldCards() {
  return old.split('<div class="menu-card ').slice(1).map(block => {
    const name = block.match(/<div class="menu-card-name">([^<]*)<\/div>/)[1];
    const allergen = block.match(/<div class="allergen-text">(.*?)<\/div>/s);
    return { name, desc: strip(block.match(/<div class="menu-card-desc">(.*?)<\/div>/s)[1]),
      allergen: allergen ? strip(allergen[1]) : '',
      price: strip(block.match(/<div class="menu-card-price">(.*?)<\/div>/s)[1]),
      sizes: [...block.matchAll(/<button type="button" class="menu-size-btn[^>]*>(.*?)<\/button>/g)].map(m => strip(m[1])) };
  });
}
function newCards() {
  return html.split('<article ').slice(1).map(block => {
    const allergen = block.match(/<p class="alg-tx">(.*?)<\/p>/s);
    return { name: block.match(/<h3 class="card-name">([^<]*)<\/h3>/)[1],
      desc: strip(block.match(/<p class="card-desc">(.*?)<\/p>/s)[1]),
      allergen: allergen ? strip(allergen[1]) : '',
      price: strip(block.match(/<div class="price">(.*?)<\/div>/s)[1]),
      sizes: [...block.matchAll(/<button type="button" class="sz[^>]*>(.*?)<\/button>/g)].map(m => strip(m[1])) };
  });
}
test('メニューの10品：品名・説明・アレルゲン・値段・入数ごとの値段が今のHPと同じ', { skip: swapped && '掛け替え後は比べる相手が無い' }, () => {
  const a = oldCards(), b = newCards();
  assert.equal(a.length, 10); assert.equal(b.length, 10);
  const norm = c => ({ ...c, allergen: c.allergen.replace(/\s/g, ''), price: c.price.replace(/\s/g, ''), sizes: c.sizes.map(s => s.replace(/\s/g, '')) });
  assert.deepEqual(b.map(norm), a.map(norm));
});

function oldRows() {
  return old.split('<div class="order-product-row ').slice(1).map(block => {
    const tag = block.slice(0, block.indexOf('>'));
    const get = k => (tag.match(new RegExp('data-' + k + '="([^"]*)"')) || [])[1];
    return { name: get('product-name'), price: get('price'), orig: get('orig-price'), base: get('base-pieces'),
      units: [...block.matchAll(/data-unit-price="(\d+)" data-unit-orig="(\d+)" data-unit-label="([^"]+)"/g)].map(m => [m[3], m[1], m[2]]),
      teas: [...block.matchAll(/data-tea-price="(\d+)" data-tea-bags="(\d+)"/g)].map(m => [m[2], m[1]]) };
  });
}
test('注文フォームの値段（基準の値段・元値・個数、ザーサイ・モンゴル茶の実額）が今のHPと同じ', { skip: swapped && '掛け替え後は比べる相手が無い' }, () => {
  const rows = html.split('<div class="order-product-row ').slice(1).map(block => {
    const tag = block.slice(0, block.indexOf('>'));
    const get = k => (tag.match(new RegExp('data-' + k + '="([^"]*)"')) || [])[1];
    return { name: get('product-name'), price: get('price'), orig: get('orig-price'), base: get('base-pieces'),
      unit: get('unit'), bags: get('tea-bags'), index: get('size-index') };
  });
  for (const o of oldRows()) {
    const mine = rows.filter(r => r.name === o.name);
    if (o.teas.length) {
      assert.deepEqual(mine.map(r => [r.bags, r.price]), o.teas, o.name);
    } else if (o.units.length) {
      assert.deepEqual(mine.map(r => [r.unit, r.price, r.orig]), o.units, o.name);
    } else {
      assert.equal(mine.length, 3, o.name);
      for (const r of mine) assert.deepEqual([r.price, r.orig, r.base], [o.price, o.orig, o.base], o.name);
    }
  }
  assert.equal(rows.length, 38);
});

test('メニューのカードに書いてある値段は、注文フォームの行（値段の正）から計算した値と同じ', () => {
  const rows = html.split('<div class="order-product-row ').slice(1).map(block => {
    const tag = block.slice(0, block.indexOf('>'));
    const get = k => (tag.match(new RegExp('data-' + k + '="([^"]*)"')) || [])[1];
    return { name: get('product-name'), card: get('card'), index: Number(get('size-index')),
      total: Number(get('price')) * Number(get('multiplier') || 1) };
  });
  const cards = html.split('<article ').slice(1);
  assert.equal(cards.length, 10);
  for (const block of cards) {
    const id = block.match(/\sid="(p\d+)"/)[1];
    const first = block.match(/<div class="ad" data-add="([^"]+)"/)[1];
    const sizes = [...block.matchAll(/<button type="button" class="sz[^>]*data-t="([^"]+)"[^>]*>([^<]*)/g)];
    const mine = rows.filter(r => r.name === first);
    assert.equal(sizes.length, mine.length, id);
    sizes.forEach((m, i) => {
      const row = mine.find(r => r.index === i);
      assert.equal(row.card, id);
      assert.equal(m[1], m[2], id + ' data-t と字が同じ');
      assert.match(m[2], new RegExp(' ¥' + row.total.toLocaleString() + '$'), id + ' ' + m[2]);
    });
    // 短冊の値段＝最初の入数の値段
    const tz = html.match(new RegExp('<a class="tz" href="#' + id + '">.*?<span class="tz-price">([^<]+)</span>'))[1];
    assert.equal(tz, '¥' + mine.find(r => r.index === 0).total.toLocaleString(), id);
    // 追加ボタンの商品名は、どれも注文フォームの行にある
    for (const m of block.matchAll(/class="add" data-add="([^"]+)" onclick="addToOrder\('([^']+)'\)"/g)) {
      assert.equal(m[1], m[2]);
      assert(rows.some(r => r.name === m[1] && r.card === id), m[1]);
    }
  }
});

test('書かない言葉（家の流儀）と絵文字が無い', () => {
  for (const [name, text] of [[PAGE, html], ['top.js', js], ['top.css', css]]) {
    for (const word of ['不使用', '無添加', '手包み']) assert(!text.includes(word), name + ' に「' + word + '」');
    const emoji = text.match(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B55}\u{FE0F}]/u);
    assert.equal(emoji, null, name + ' に絵文字: ' + (emoji && emoji[0]));
  }
});

test('外の部品を勝手に読み込んでいない（Stripe・GA4 だけ。書体・紙吹雪は自前）', () => {
  const srcs = [...html.matchAll(/<(?:script|link|img|source|iframe)[^>]+(?:src|href|srcset)="(https?:\/\/[^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(srcs, ['https://aikaro.jp/', 'https://js.stripe.com/v3/']);   // canonical と Stripe
  assert.doesNotMatch(css, /url\(\s*["']?(https?:)?\/\//);   // 外の住所を読む url() が無い（data: の絵は自前）
  assert.doesNotMatch(css, /@import/);
  const hosts = new Set([...js.matchAll(/https?:\/\/([a-z0-9.-]+)/g)].map(m => m[1]));
  assert.deepEqual([...hosts].sort(), ['akira042425-1.onrender.com', 'lin.ee', 'zipcloud.ibsnet.co.jp']);
  // 書体は自前（fonts/）。ライセンス文も同じ場所に置く
  assert.match(css, /src:url\(fonts\/smb1-500\.woff2\)/);
  assert.match(css, /src:url\(fonts\/smb1-800\.woff2\)/);
  for (const f of ['fonts/smb1-500.woff2', 'fonts/smb1-800.woff2', 'fonts/OFL-shipporiminchob1.txt']) assert(exists(f), f);
});

test('写真・書体のファイルが全部ある', () => {
  const files = new Set();
  for (const m of html.matchAll(/(?:src|href)="((?:images|fonts)\/[^"?]+)/g)) files.add(m[1]);
  for (const m of html.matchAll(/srcset="([^"]+)"/g)) for (const part of m[1].split(',')) files.add(part.trim().split(/\s+/)[0]);
  assert(files.size > 30, String(files.size));
  const missing = [...files].filter(f => !exists(f));
  assert.deepEqual(missing, []);
});

// ── つなぎ先（HP_CONFIG）：aikaro.jp 以外で開いたら本番へつながない ──
function config({ host, preview = false, localConfig = null, origin } = {}) {
  const a = js.indexOf('  const HP_CONFIG = (function () {');
  const b = js.indexOf('  // ============================================================\n  // 商品価格の自動同期', a);
  assert(a >= 0 && b > a);
  const fetched = [];
  const context = {
    window: { location: { hostname: host, origin: origin || (host ? 'http://' + host + ':8985' : 'null') } },
    document: { querySelector: sel => (sel === 'meta[name="aikaro-preview"]' && preview) ? {} : null },
    fetch(url) {
      fetched.push(url);
      return localConfig === null ? Promise.reject(new Error('no server'))
        : Promise.resolve({ ok: true, json: () => Promise.resolve(localConfig) });
    },
  };
  vm.createContext(context);
  vm.runInContext(js.slice(a, b) + '\nthis.result = HP_CONFIG;', context);
  return { cfg: context.result, fetched };
}
const PROD_API = 'https://akira042425-1.onrender.com';

test('本番の住所と本番用の鍵は top.js に1か所ずつだけ（HP_CONFIG の中）', () => {
  assert.equal(js.split('onrender.com').length - 1, 1);
  assert.equal(js.split('pk_live_').length - 1, 1);
  assert.doesNotMatch(js, /sk_(live|test)_/);
});

test('aikaro.jp で開いた時だけ本番につなぐ', async () => {
  for (const host of ['aikaro.jp', 'www.aikaro.jp']) {
    const { cfg, fetched } = config({ host });
    assert.equal(cfg.mode, 'production');
    assert.equal(cfg.apiBase, PROD_API);
    assert.match(cfg.stripeKey, /^pk_live_/);
    assert.equal(cfg.canSend, true);
    assert.deepEqual(fetched, []);
    await cfg.ready;
  }
});

test('aikaro.jp の上でも「見るだけ」の印がある間は、鍵を持たず・送らない', () => {
  const { cfg } = config({ host: 'aikaro.jp', preview: true });
  assert.equal(cfg.mode, 'preview');
  assert.equal(cfg.stripeKey, '');
  assert.equal(cfg.canSend, false);
  assert.match(cfg.blockedMessage, /確認用/);
});

test('手元（localhost・同じWi-Fiのスマホ・file://・よく似た名前の場所）で開くと、本番へは絶対につながない', async () => {
  for (const host of ['localhost', '127.0.0.1', '192.168.1.23', '', 'aikaro.jp.example.com', 'example.github.io', 'staging.aikaro.jp']) {
    const { cfg, fetched } = config({ host });
    assert.equal(cfg.mode, 'local', host);
    assert.notEqual(cfg.apiBase, PROD_API, host);
    assert.doesNotMatch(cfg.apiBase, /onrender\.com/, host);
    assert.equal(cfg.stripeKey, '', host);
    assert.deepEqual(fetched, ['/__local/config'], host);
    await cfg.ready;
    assert.equal(cfg.stripeKey, '', host + '：確認用サーバーが無ければ鍵は空のまま');
  }
});

test('手元で受け取る Stripe の鍵はテスト用（pk_test_）だけ。本番用の鍵を渡されても受け取らない', async () => {
  const live = config({ host: 'localhost', localConfig: { stripe_publishable_key: 'pk_live_xxxxxxxx' } });
  await live.cfg.ready;
  assert.equal(live.cfg.stripeKey, '');
  const odd = config({ host: 'localhost', localConfig: { stripe_publishable_key: ' pk_test_x', api_base: PROD_API } });
  await odd.cfg.ready;
  assert.equal(odd.cfg.stripeKey, '');
  assert.equal(odd.cfg.apiBase, 'http://localhost:8985');   // つなぎ先は手元のまま（外から差し替えられない）
  const test_ = config({ host: 'localhost', localConfig: { stripe_publishable_key: 'pk_test_abc123' } });
  await test_.cfg.ready;
  assert.equal(test_.cfg.stripeKey, 'pk_test_abc123');
});

test('鍵が無い時・見るだけの時は、お支払い欄を作らず催事アプリにも尋ねない', () => {
  const a = js.indexOf('  async function mountCardPaymentElement(orderData) {');
  const body = js.slice(a, js.indexOf('\n  }\n', a));
  const guard = body.indexOf('if (!HP_CONFIG.stripeKey) throw new Error(HP_CONFIG.blockedMessage);');
  assert(guard > 0 && guard < body.indexOf('fetch('), '守りが fetch より前に無い');
  assert(body.indexOf('await HP_CONFIG.ready;') < guard);
});

test('催事アプリへの通信は、どれも HP_CONFIG のつなぎ先を使う', () => {
  const calls = [...js.matchAll(/fetch\(([^,)]+)/g)].map(m => m[1].trim());   // 最初の「,」か「)」まで
  assert.deepEqual(calls.sort(), [
    "'/__local/config'",
    "'https://zipcloud.ibsnet.co.jp/api/search?zipcode=' + zip",
    'API',
    "HP_CONFIG.apiBase + '/events/api/public/schedule'",
    "HP_CONFIG.apiBase + '/orders/api/hp-order'",
    "HP_CONFIG.apiBase + '/orders/api/point-check?phone=' + encodeURIComponent(phone",
    "HP_CONFIG.apiBase + '/orders/api/point-check?phone=' + encodeURIComponent(phone",
    "PAYMENT_API_BASE + '/create-intent'",
  ].sort());
  assert.match(js, /const API = HP_CONFIG\.apiBase \+ '\/orders\/api\/products';/);
  assert.match(js, /const PAYMENT_API_BASE = HP_CONFIG\.apiBase \+ '\/payment';/);
});

test('今のHPのファイルは、新しいページのために書き換えていない（styles.css・app.js は名前を分けた）', { skip: swapped && '掛け替え後' }, () => {
  assert.doesNotMatch(old, /top\.css|top\.js/);
  assert.match(old, /<link rel="stylesheet" href="styles\.css/);
  assert.match(old, /<script src="app\.js/);
});

// ── 書体：見出し・ボタンの字が、自前の書体ファイルを作った時の字の一覧に入っている ──
// 書体ファイルには画面の字だけが入っている。見出しやボタンの文言を変えて、ここが落ちたら、
// scripts/fonts_collect.mjs → scripts/fonts_subset.py で書体を作り直す（やり方は fonts_collect.mjs の頭に書いてある）。
// ※ ここで見ているのは見出し（h1〜h4・legend）とボタンの字だけ。値段や案内文など全部の字は、作り直しの道具が実際の画面から集める。
test('書体：見出し・ボタンの字は、書体ファイルを作った時の字の一覧（fonts/chars.json）に入っている', () => {
  const chars = JSON.parse(read('fonts/chars.json'));
  const have = new Set([...chars['500'], ...chars['800']]);
  assert(chars['500'].length > 200 && chars['800'].length > 120);
  const body = html.slice(html.indexOf('<body>')).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const texts = [...body.matchAll(/<(h[1-4]|legend)\b[^>]*>([\s\S]*?)<\/\1>/g)].map(m => strip(m[2]))
    .concat([...body.matchAll(/<a\b[^>]*class="btn[^"]*"[^>]*>([\s\S]*?)<\/a>/g)].map(m => strip(m[1])))
    .concat([...body.matchAll(/<button\b[^>]*class="(?:submit|rev-ok|done-close)[^"]*"[^>]*>([\s\S]*?)<\/button>/g)].map(m => strip(m[1])));
  assert(texts.length > 40, String(texts.length));
  const missing = new Set();
  for (const t of texts) for (const c of t) if (!/\s/.test(c) && !have.has(c)) missing.add(c);
  assert.deepEqual([...missing], [], '書体ファイルに無い字（scripts/fonts_collect.mjs から作り直す）');
});

// ── お金の関数は、今の app.js と一字一句同じ（掛け替えまでの間、片方だけ直して食い違うのを防ぐ）──
// 今の app.js を直した時（値段・送料・文言など）は、同じ直しを top.js にも入れる。ここが落ちたらその合図。
// 少しだけ違う関数（つなぎ先・色・絵文字・見るだけの守り）は下の「違ってよい所」に理由つきで並べてある。
function fnBody(src, name) {
  const m = src.match(new RegExp('\\n  (?:async )?function ' + name + '\\('));
  if (!m) return null;
  return src.slice(m.index + 1, src.indexOf('\n  }\n', m.index + 1) + 5);
}
test('お金と送信の関数は、今の app.js と一字一句同じ', { skip: !exists('app.js') && '片付け後（app.js が無い）' }, () => {
  const app = read('app.js');
  const SAME = ['getRowMultiplier', 'getRowPrice', 'getRowProductName', 'getRowPieces',
    'calcShipping', 'calcCodFee', 'getDestPrefecture', 'getOrderSubtotal', 'getOrderTotalNum', 'resolveUsablePoints', 'useAllPoints',
    'hidePointUseBox', 'buildOrderPayload', 'getOrderReviewDetails', 'handleOrderSubmit', 'confirmReviewedOrder',
    'handleCardPaymentSubmit', 'cardPrepErrorMsg', 'updateCardPaymentUI', 'scheduleCardRemount', 'unmountCardPaymentElement',
    'showCardError', 'clearCardError', 'hideCardChargeAmount', 'closeOrderReview', 'isOrderReviewOpen',
    'shouldShowReviewPointGuide', 'goToPointUseFromReview', 'getOrderProgressTarget', 'linkLineWithPhone', 'linkLineFromOrder', 'handleSubmit'];
  for (const name of SAME) {
    const a = fnBody(app, name), b = fnBody(js, name);
    assert(a && b, name + ' が見つからない');
    assert.equal(b, a, name + ' が app.js と違う');
  }
  // 送料・最低金額・代引きの数字も同じ
  for (const line of ['const FREE_SHIPPING_LINE = 8000;', 'const MIN_ORDER_SUBTOTAL = 2000;', 'const UNIFORM_SHIPPING_FEE = 1200;',
    "const SEPARATE_QUOTE_PREFS = ['北海道', '沖縄県'];", 'const MIN_POINT_USE = 50;', 'const TEA_PIECES_PER_BAG = 30;']) {
    assert(app.includes(line) && js.includes(line), line);
  }
});
test('少しだけ違う関数は、違いが「決めた所」だけ', { skip: !exists('app.js') && '片付け後（app.js が無い）' }, () => {
  const app = read('app.js');
  // [関数名, app.js の文字 → top.js の文字 の置き換え]。置き換えた結果が top.js と一字一句同じになること。
  const API = "'https://akira042425-1.onrender.com/orders/api/";
  const DIFF = {
    lookupPoints: [["fetch(" + API + "point-check", "fetch(HP_CONFIG.apiBase + '/orders/api/point-check"]],
    checkPointBalance: [["fetch(" + API + "point-check", "fetch(HP_CONFIG.apiBase + '/orders/api/point-check"]],
    updateTotal: [["' ＋ \u{1F389} 送料無料（¥8,000以上）'", "' ＋ 送料無料（¥8,000以上）'"]],                 // 絵文字を使わない
    _copyAndOpenLine: [["'✓ コピーしました'", "'コピーしました'"]],                                        // 同上
    applyPointDiscount: [["textEl.style.color = '#aaa';", "infoEl.classList.add('low');"],                       // 色は top.css で付ける
      ["textEl.style.color = '#E84040';", "infoEl.classList.remove('low');"]],
    updatePaymentOptions: [["codOption.style.display = '';\n", "codOption.style.display = '';\n      codOption.disabled = false;\n"],   // Safari でも代金引換を選べなくする
      ["codOption.style.display = 'none';\n", "codOption.style.display = 'none';\n      codOption.disabled = true;\n"]],
    getStripe: [['window.Stripe) {', 'window.Stripe && HP_CONFIG.stripeKey) {'], ['window.Stripe(STRIPE_PUBLISHABLE_KEY)', 'window.Stripe(HP_CONFIG.stripeKey)']],
    renderOrderReview: [["const totals = add('dl', '');\n", "const totals = add('dl', '');\n    totals.className = 'tot';\n"],   // top.css の名前を付けるだけ
      ["'order-review-point-guide'", "'rev-pt'"], ["'order-review-point-guide-btn'", "'rev-pt-b'"]],
  };
  for (const [name, swaps] of Object.entries(DIFF)) {
    let a = fnBody(app, name);
    const b = fnBody(js, name);
    assert(a && b, name);
    for (const [from, to] of swaps) { assert(a.includes(from), name + ': ' + from); a = a.split(from).join(to); }
    assert.equal(b, a, name);
  }
  // submitReviewedOrder：つなぎ先と「見るだけ」の守りだけが違う
  const sent = fnBody(js, 'submitReviewedOrder');
  const guardStart = sent.indexOf('    // 確認用ページ（隠しページ）では、ここから先');
  const guardEnd = sent.indexOf('    orderSubmissionInProgress = true;');
  assert(guardStart > 0 && guardEnd > guardStart);
  assert.equal((sent.slice(0, guardStart) + sent.slice(guardEnd)).replace("fetch(HP_CONFIG.apiBase + '/orders/api/hp-order'", "fetch(" + API + "hp-order'"),
    fnBody(app, 'submitReviewedOrder'));
});

// ── 2026-11-19 巨匠の点検で足した見張り ──
// 送信中の幕は showModal() で出さない（カードの本人確認の画面が幕の後ろに隠れて押せなくなるため）。
function flowHarness({ nativeDialog = true } = {}) {
  const a = js.indexOf('  function setOrderFlow(mode) {');
  const b = js.indexOf('  (function guardOrderFlowDialog() {', a);
  assert(a >= 0 && b > a);
  const calls = [];
  const classes = new Set(), attrs = new Map();
  const flow = {
    classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x) },
    setAttribute: (k, v) => attrs.set(k, v), removeAttribute: k => attrs.delete(k), hasAttribute: k => attrs.has(k),
    scrollTop: 0,
  };
  if (nativeDialog) {
    flow.showModal = () => { calls.push('showModal'); attrs.set('open', ''); };
    flow.close = () => { calls.push('close'); attrs.delete('open'); };
  }
  const sending = { hidden: true }, done = { hidden: true };
  const context = { document: { getElementById: id => ({ orderFlowDialog: flow, orderProcessingOverlay: sending, orderCompleteOverlay: done })[id] || null } };
  vm.createContext(context);
  vm.runInContext(js.slice(a, b), context);
  return { context, calls, classes, attrs, sending, done };
}
test('送信中の幕は showModal() を使わず、ページの上に重ねるだけ（カードの本人確認の画面を隠さない）', () => {
  const h = flowHarness();
  h.context.setOrderFlow('sending');
  assert.deepEqual(h.calls, [], '送信中に showModal() を呼んでいる');
  assert(h.attrs.has('open') && h.classes.has('flow-inline'));
  assert.equal(h.sending.hidden, false); assert.equal(h.done.hidden, true);
  assert.equal(h.context.isOrderFlowMode('sending'), true);
  // 失敗して入力へ戻る時は、きれいに閉じる
  h.context.setOrderFlow(null);
  assert.deepEqual(h.calls, []);
  assert(!h.attrs.has('open') && !h.classes.has('flow-inline'));
});
test('完了画面は showModal() で出す（送信中から切り替わる時は、重ねた幕を外してから開き直す）', () => {
  const h = flowHarness();
  h.context.setOrderFlow('sending');
  h.context.setOrderFlow('done');
  assert.deepEqual(h.calls, ['showModal']);
  assert(h.attrs.has('open') && !h.classes.has('flow-inline'));
  assert.equal(h.sending.hidden, true); assert.equal(h.done.hidden, false);
  h.context.setOrderFlow(null);
  assert.deepEqual(h.calls, ['showModal', 'close']);
  assert(!h.attrs.has('open'));
  // 送信中を通らずに完了を出しても同じ
  const direct = flowHarness();
  direct.context.setOrderFlow('done');
  assert.deepEqual(direct.calls, ['showModal']);
});
test('dialog を知らない古い端末では、送信中も完了も重ねて出す（今までどおり）', () => {
  const h = flowHarness({ nativeDialog: false });
  h.context.setOrderFlow('sending');
  h.context.setOrderFlow('done');
  assert(h.attrs.has('open') && h.classes.has('flow-inline'));
  assert.equal(h.done.hidden, false);
  h.context.setOrderFlow(null);
  assert(!h.attrs.has('open') && !h.classes.has('flow-inline'));
});
test('重ねて出した幕の後ろは透けず・押せない（画面いっぱいの暗幕の板がある）', () => {
  assert.match(css, /\.flow\.flow-inline\[open\]::before\{content:"";position:fixed;top:0;right:0;bottom:0;left:0;z-index:-1;background:rgba\(13,13,15,\.93\)\}/);
});
test('お支払いの画面からブラウザの「戻る」で帰った時は、送信中の幕を下ろす（pageshow）', () => {
  const a = js.indexOf("  window.addEventListener('pageshow', function releaseOrderFlowOnReturn(event) {");
  assert(a >= 0, 'pageshow の受け口が無い');
  const src = js.slice(a, js.indexOf('\n  });\n', a) + 7);
  const run = (persisted, sendingNow) => {
    let handler = null, hidden = 0;
    const context = { window: { addEventListener: (name, fn) => { assert.equal(name, 'pageshow'); handler = fn; } },
      isOrderFlowMode: mode => mode === 'sending' && sendingNow, hideOrderProcessingOverlay: () => { hidden++; } };
    vm.createContext(context); vm.runInContext(src, context);
    handler({ persisted });
    return hidden;
  };
  assert.equal(run(true, true), 1, '控えから戻ったのに幕を下ろしていない');
  assert.equal(run(false, true), 0, '普通の読み込みでは何もしない');
  assert.equal(run(true, false), 0, '送信中でなければ何もしない（完了画面を消さない）');
});
test('確認用ページ（見るだけ）の間だけ、「銀行振込に切り替えると確認画面を見られる」案内を出す', () => {
  const a = js.indexOf('  (function showPreviewNotice() {');
  assert(a >= 0);
  const src = js.slice(a, js.indexOf('\n  })();\n', a) + 9);
  const run = mode => {
    const inserted = [];
    const cardBox = { parentNode: { insertBefore: (el, before) => { assert.equal(before, cardBox); inserted.push(el); } } };
    const context = { HP_CONFIG: { mode }, document: {
      getElementById: id => id === 'cardPaymentBox' ? cardBox : null,
      createElement: tag => ({ tag, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }) } };
    vm.createContext(context); vm.runInContext(src, context);
    return inserted;
  };
  const shown = run('preview');
  assert.equal(shown.length, 1);
  assert.equal(shown[0].tag, 'p'); assert.equal(shown[0].className, 'pv-note');
  assert.match(shown[0].textContent, /カードの入力欄が出ません/);
  assert.match(shown[0].textContent, /「銀行振込」に切り替えて/);
  assert.doesNotMatch(shown[0].textContent, /\p{Extended_Pictographic}/u);
  assert.deepEqual(run('production'), [], '掛け替え後に案内が出ている');
  assert.deepEqual(run('local'), []);
  assert.match(css, /\.pv-note\{[^}]*font-size:16px/);
  // 最後のボタンを押した時の文にも、同じ道案内がある
  assert.match(config({ host: 'aikaro.jp', preview: true }).cfg.blockedMessage, /「銀行振込」/);
});
test('アクセス解析（GA4）は、aikaro.jp の上でも「見るだけ」の印がある間は読まない', () => {
  const a = html.indexOf('window.dataLayer = window.dataLayer || [];');
  const src = html.slice(a, html.indexOf('</script>', a));
  const run = (hostname, preview) => {
    const added = [];
    const context = { window: {}, location: { hostname },
      document: { querySelector: sel => (sel === 'meta[name="aikaro-preview"]' && preview) ? {} : null,
        createElement: () => ({}), head: { appendChild: el => added.push(el.src) } } };
    context.window = context;
    vm.createContext(context); vm.runInContext(src, context);
    return { added, pushed: context.dataLayer.length };
  };
  assert.deepEqual(run('aikaro.jp', true), { added: [], pushed: 0 });
  assert.deepEqual(run('localhost', false), { added: [], pushed: 0 });
  const live = run('aikaro.jp', false);
  assert.equal(live.added.length, 1); assert.match(live.added[0], /googletagmanager\.com\/gtag\/js\?id=G-H5MT5P6XZH/);
  assert.equal(live.pushed, 2);
});
