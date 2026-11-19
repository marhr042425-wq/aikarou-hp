// トップページ（index-a.html／掛け替え後は index.html）で「Aika Mincho」（しっぽり明朝B1 から抜いた書体）を使っている字を、
// 実際の画面から集める → fonts/chars.json（太さ別）。そのあと scripts/fonts_subset.py で書体ファイルを作り直す。
//
// なぜ要るか：書体ファイル（fonts/smb1-500.woff2・smb1-800.woff2）には「画面に出る字だけ」が入っている。
// 見出し・ボタン・値段などの文言を1字でも変えると、その字だけ端末の明朝に化ける。文言を変えたら、この2つを流し直す。
//
// 使い方（HPの置き場の根で。外へは通信しない）:
//   1) 確認用サーバーを立てる:  python3 scripts/local_preview_server.py --port 8985
//   2) 字を集める:            PW=<playwright の場所> node scripts/fonts_collect.mjs http://127.0.0.1:8985/index-a.html fonts/chars.json
//   3) 書体を作り直す:         python3 scripts/fonts_subset.py fonts/chars.json <元の書体の場所> fonts
//      （元の書体＝ShipporiMinchoB1-Medium.ttf / -ExtraBold.ttf。SIL Open Font License。fonttools と brotli が要る）
//   4) 確認用サーバーを止める。
//
// 集め方：空の画面／品を入れた画面／確認画面／送信中／完了（銀行振込・カード）／催事の予定なし・読み込めない時 などを
// 順に作り、その時に Aika Mincho で描かれている字を太さ別に拾う。お名前・ご住所・会場名など、その時々で変わる字は端末の書体で出る。
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright');
const [url, outPath] = process.argv.slice(2);
if (!url || !outPath) { console.error('使い方: node scripts/fonts_collect.mjs <ページのURL> <出力先 chars.json>'); process.exit(1); }
const origin = new URL(url).origin;
const sets = { 500: new Set(), 800: new Set() };

const GRAB = `(() => { const out = { 500: '', 800: '' };
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) { const p = n.parentElement; if (!p || /^(SCRIPT|STYLE)$/.test(p.tagName)) continue;
    const cs = getComputedStyle(p); if (!/^"?Aika Mincho/.test(cs.fontFamily)) continue;
    out[+cs.fontWeight >= 600 ? 800 : 500] += n.textContent; }
  out[500] += [...document.querySelectorAll('[data-ch]')].map(e => e.dataset.ch).join('');
  return out; })()`;

// 画面の状態を順に作る（どれも top.js の本物の関数を呼ぶ。注文は送らない）
const STATES = [
  () => {},
  () => {   // 品を入れる（入数違い・ザーサイ・モンゴル茶）。お届け先はまだ
    document.querySelectorAll('.order-product-row').forEach((row, i) => { if (i % 3 !== 1) setRowQty(row, 1 + (i % 2)); });
    document.querySelector('#orderItems').scrollIntoView(); syncCartBarLabel();
  },
  () => {   // お届け先あり・代金引換
    orderName.value = '確認'; orderPhone.value = '09011112222'; orderZip.value = '810-0001'; orderAddress.value = '福岡県福岡市中央区天神'; orderBanchi.value = '1';
    orderDelivery.value = 'yamato'; updatePaymentOptions(); orderPayment.value = 'cod'; updateTotal();
  },
  () => { handleOrderSubmit({ preventDefault() {} }); },                                   // 確認画面（代金引換）
  () => { closeOrderReview(); orderAddress.value = '北海道札幌市中央区'; updateTotal(); handleOrderSubmit({ preventDefault() {} }); },   // 送料別途
  () => { closeOrderReview(); orderAddress.value = '福岡県福岡市中央区天神'; orderPayment.value = 'bank'; updateTotal();
    customerPoints = 120; document.getElementById('pointUseBox').style.display = ''; handleOrderSubmit({ preventDefault() {} }); },      // ポイントの案内つき
  () => { closeOrderReview(); showCardChargeAmount(5000, 5100, 100); showCardError('確認'); showOrderProcessingOverlay(); },
  () => { const data = buildOrderPayload(); data.use_points = 100;
    showOrderCompleteScreen(data, { point_info: '\\nポイント: +12pt（残高: 132pt / 会員#0001）', line_linked: false, phone: '09011112222' }); },
  () => { closeOrderComplete(); setRowQty(document.querySelector('.order-product-row'), 3);
    orderName.value = '確認'; orderAddress.value = '福岡県福岡市'; orderZip.value = '810-0001'; orderBanchi.value = '1';
    const data = buildOrderPayload(); data.use_points = 100; data.payment = 'クレジットカード'; showOrderCompletePending(data); },
  () => { closeOrderComplete(); document.getElementById('pointBalanceNum').textContent = '-'; document.getElementById('pointResult').classList.add('show');
    document.getElementById('orderSubmitBtn').textContent = '送信中...'; },
];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
for (const [w, h, mobile] of [[1440, 900, false], [390, 844, true]]) {
  for (const schedule of ['list', 'empty', 'fail']) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, locale: 'ja-JP' });
    const page = await ctx.newPage();
    await ctx.route('**/*', r => {
      const u = r.request().url();
      if (!u.startsWith(origin)) return r.abort();                       // 外へは通信しない
      if (u.includes('/events/api/public/schedule') && schedule !== 'list') {
        return schedule === 'empty' ? r.fulfill({ contentType: 'application/json', body: '[]' }) : r.abort();
      }
      return r.continue();
    });
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    for (const state of (schedule === 'list' ? STATES : STATES.slice(0, 1))) {
      await page.evaluate(state);
      await page.waitForTimeout(150);
      const got = await page.evaluate(GRAB);
      for (const k of [500, 800]) for (const c of got[k]) if (!/\s/.test(c)) sets[k].add(c);
    }
    await ctx.close();
  }
}
await browser.close();

// 画面が書き変わって出る字（数量・金額・日付・その時々の案内）は、どの太さにも必ず入れる
const ALWAYS = '0123456789¥,.-−＋+%/〜:：・（）()#pt無料袋個入計×点月日'
  + '別途ご案内郵便番号の入力後に計算'                       // 伝票の送料
  + '注文へ進む内容を確認する送信中'                         // 帯・送信ボタン
  + 'この内容で注文を確定する送料別途を支払う'               // 確認画面の最後のボタン
  + '現在予定されている催事はありませんスケジュール'         // 催事の予定が無い時
  + 'このカードへのご請求額ご注文内容お届け先・お支払い明細合計金額商品小計';
for (const k of [500, 800]) for (const c of ALWAYS) if (!/\s/.test(c)) sets[k].add(c);
const out = { 500: [...sets[500]].sort().join(''), 800: [...sets[800]].sort().join('') };
writeFileSync(outPath, JSON.stringify(out, null, 1) + '\n');
console.log('500:', out[500].length, '字 / 800:', out[800].length, '字 →', outPath);
