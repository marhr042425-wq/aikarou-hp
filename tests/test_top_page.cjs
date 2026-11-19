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
