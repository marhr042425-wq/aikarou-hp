  // ============================================================
  // つなぎ先（催事アプリ・Stripe）は、ここ1か所で決める。
  //
  //  ・aikaro.jp で開いた時だけ、本番の催事アプリ・本番の Stripe につなぐ。
  //  ・それ以外（手元の localhost・同じWi-Fiのスマホ・file:// など）で開いた時は、
  //    本番へは絶対につながない。催事アプリの受け口は「いま開いている場所」を見に行き、
  //    Stripe の鍵は手元の確認用サーバー（scripts/local_preview_server.py）が渡す
  //    テスト用の鍵（pk_test_ で始まる物）だけを受け取る。本番用の鍵は受け取らない。
  //    （2026-07-10：手元の試し注文が本番に混ざった事故の型をふさぐ）
  //  ・aikaro.jp の上でも、ページに <meta name="aikaro-preview"> がある間は「見るだけ」：
  //    値段・催事スケジュール・ポイント残高は読むが、お支払い欄は出さず、注文も送らない。
  //    （隠しページ用。index.html に掛け替える時に、その meta を消す）
  // ============================================================
  const HP_CONFIG = (function () {
    const PROD_HOSTS = ['aikaro.jp', 'www.aikaro.jp'];
    const PROD_API_BASE = 'https://akira042425-1.onrender.com';
    const PROD_STRIPE_KEY = 'pk_live_51Tr9DeKcjgjrrEc7m6bPcA1qAeUezMYcy4y54Q4OlA1kWoZYq39DUf1VnjrXHyxJoph09LLUGKkjn3lbkl0perOu005b6JT774';
    if (PROD_HOSTS.indexOf(window.location.hostname) !== -1) {
      const preview = !!document.querySelector('meta[name="aikaro-preview"]');
      return {
        mode: preview ? 'preview' : 'production',
        apiBase: PROD_API_BASE,
        stripeKey: preview ? '' : PROD_STRIPE_KEY,
        canSend: !preview,
        blockedMessage: preview ? 'このページは確認用のため、お支払い・ご注文の送信はできません。確認画面は、お支払い方法を「銀行振込」にするとご覧いただけます。' : '',
        ready: Promise.resolve(),
      };
    }
    const local = {
      mode: 'local',
      apiBase: window.location.origin,
      stripeKey: '',
      canSend: true,
      blockedMessage: '手元の確認用ページです。テスト用の鍵が渡されていないため、お支払い欄は出ません。',
      ready: null,
    };
    local.ready = fetch('/__local/config', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : {})
      .then(data => {
        const key = String((data && data.stripe_publishable_key) || '');
        if (/^pk_test_/.test(key)) local.stripeKey = key;
      })
      .catch(() => {});
    return local;
  })();

  // ============================================================
  // 商品価格の自動同期（催事システムDBから fetch）
  // 催事システムで価格を変更すると aikaro.jp が次回読込時に自動反映。
  // 失敗時は HTML ハードコード値をそのまま表示する（フォールバック）。
  // 値段の正は注文フォームの行（.order-product-row の data-price）。
  // メニューのカード・短冊・入数ボタンの値段は、行から計算して書く（renderCardPrices）。
  // ============================================================
  (function syncHpPrices() {
    const API = HP_CONFIG.apiBase + '/orders/api/products';
    fetch(API, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => {
        if (!data || !Array.isArray(data.products)) return;
        const map = {};
        data.products.forEach(p => {
          const key = (p.hp_display_name || p.name || '').trim();
          if (key) map[key] = p;
        });
        applyHpPrices(map);
      })
      .catch(err => {
        console.warn('価格同期スキップ（HTMLハードコード値を表示）:', err);
      });

    function fmt(n) {
      return '¥' + Number(n || 0).toLocaleString();
    }

    function applyHpPrices(map) {
      // 1. 注文フォームの行（.order-product-row）＝値段の正
      document.querySelectorAll('.order-product-row').forEach(row => {
        // モンゴル茶は行ごとに割引済みの実額を持つため、DB単価での上書き対象外
        if (row.classList.contains('has-tea-size')) return;
        // ザーサイ（140g/280g）も行ごとに実額を持つため上書き対象外
        if (row.classList.contains('has-unit-size')) return;
        // 「肉焼売【生冷凍】」「肉焼売【調理済み冷凍】」も「肉焼売」にマッチ
        const rawName = getRowProductName(row).trim();
        const baseName = rawName.replace(/【[^】]+】/g, '').trim();
        const p = map[rawName] || map[baseName];
        if (!p) return;
        // data-price は「基準パック価格」。8個入・12個入の行は 基準×倍率 でJS側が計算するので、
        // どの入数の行にも基準価格を入れる。
        row.dataset.price = String(p.hp_price);
        if (p.hp_unit) row.dataset.unit = p.hp_unit;
        row.dataset.origPrice = String(p.hp_original_price || '');
        renderSizeRowPrice(row);
      });

      // 2. メニューのカード・短冊・入数ボタン（行から計算して書く）
      renderCardPrices();
      // 「店長イチオシ」は見出しの商品名で引く（HTML上は海老焼売）
      const featuredTitle = document.querySelector('.feat-tx h2');
      if (featuredTitle) {
        const p = map[featuredTitle.textContent.trim()];
        if (p) {
          const origEl = document.querySelector('.feat-price s');
          const hpEl = document.querySelector('.feat-price b');
          if (origEl) origEl.textContent = fmt(p.hp_original_price);
          if (hpEl) hpEl.textContent = fmt(p.hp_price);
          if (p.hp_unit) {
            const smallEl = document.querySelector('.feat-price small');
            if (smallEl) smallEl.textContent = '/ ' + p.hp_unit + '（税込）';
          }
        }
      }

      // 3. すでにカートに入っている行の小計・合計・伝票も、新しい値段で作り直す
      document.querySelectorAll('.order-product-row').forEach(row => {
        const qty = getRowQty(row);
        if (qty > 0) row.querySelector('.order-subtotal').textContent = '¥' + (getRowPrice(row) * qty).toLocaleString();
      });
      updateTotal();
    }
  })();

  // ============================================================
  // サイズ選択ヘルパー（焼き小籠包など「◯個入」を選べる商品用）
  // data-price は基準パック価格（例 4個¥855）。8個=×2、12個=×3 をJSで計算。
  // サイズ選択が無い商品は multiplier=1 として従来どおり動く。
  // ============================================================
  function getRowMultiplier(row) {
    const m = parseInt(row.dataset.multiplier);
    return (m && m > 0) ? m : 1;
  }
  // その行の「1袋あたりの価格」（基準価格×倍率）
  function getRowPrice(row) {
    return parseInt(row.dataset.price) * getRowMultiplier(row);
  }
  // その行の商品名（サーバーへ送る・台帳と突き合わせる日本語の正式名）。
  // 画面の文字（.order-product-name）はブラウザの「ページを翻訳」で訳されてしまうので、
  // 翻訳されない data-product-name を正とする。無い行だけ従来どおり画面の文字を使う。
  // （2026-11-12 PR-4：訳された名前を送るとサーバーが「確認できない商品」と断るため）
  function getRowProductName(row) {
    const fixed = row.dataset ? row.dataset.productName : '';
    if (fixed) return fixed;
    const nameEl = row.querySelector('.order-product-name');
    return nameEl ? nameEl.textContent : '';
  }
  // その行の「1袋あたりの個数」（基準個数×倍率）。サイズ非対応行は0を返す。
  function getRowPieces(row) {
    const base = parseInt(row.dataset.basePieces);
    if (!base) return 0;
    return base * getRowMultiplier(row);
  }

  // メニューカードのサイズボタンを押したとき（カードの見た目だけ切替）。
  // カートの中身は変えない。その入数の数が入っていれば「− 数 ＋」、無ければ「カートに追加」に変わる。
  function selectSize(btn) {
    const wrap = btn.closest('.sizes');
    if (!wrap) return;
    wrap.querySelectorAll('.sz').forEach(b => {
      b.classList.remove('on');
      b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('on');
    btn.setAttribute('aria-pressed', 'true');
    const card = btn.closest('.card');
    if (card) renderCard(card);
  }

  // 注文フォームの行は「1品×1入数」で決め打ち（2026-11 A案）。行の中で入数は切り替えない。
  // 同じ品の 4個入 と 8個入 は別の行なので、同時にカートに入れられる。
  // 行の価格テキスト（入数の札＋「¥1,600 → ¥1,520（税込）」）を、行の値段から書き直す（価格同期のあと）
  function renderSizeRowPrice(row) {
    const priceEl = row.querySelector('.order-product-price');
    if (!priceEl) return;
    const pieces = getRowPieces(row);
    const price = getRowPrice(row);
    const origAttr = row.dataset.origPrice;
    let html = '<span class="pk-size">' + pieces + '個入</span><span class="nw">';
    if (origAttr) {
      // 元値も倍率に合わせて表示（基準元値×倍率）
      const orig = parseInt(origAttr) * getRowMultiplier(row);
      html += '<s>¥' + orig.toLocaleString() + '</s> → ';
    }
    html += '<b>¥' + price.toLocaleString() + '</b>（税込）</span>';
    priceEl.innerHTML = html;
  }

  // モンゴル茶は1袋30個入（明細の「計○個」の計算に使う）。
  // 1袋/2袋/3袋の行ごとに「割引済みの実額」を data-price に持つ（倍率方式ではない）。
  const TEA_PIECES_PER_BAG = 30;   // 1袋の個数

  // ザーサイ（140g / 280g）も、行ごとに「税込の実額」を data-price に持つ実額方式。
  // どちらも data-multiplier を持たないので getRowPrice() は data-price×1＝実額になる。

  // その行の数量（カートの正。0＝選んでいない）
  function getRowQty(row) {
    const numEl = row.querySelector('.order-qty-num');
    return (numEl && parseInt(numEl.textContent)) || 0;
  }
  // 「品名 × 何番目の入数」から注文フォームの行を探す（入数の順番はカードの入数ボタンと同じ）
  function findOrderRow(productName, sizeIndex) {
    const rows = document.querySelectorAll('.order-product-row');
    for (const row of rows) {
      if (getRowProductName(row) === productName && String(row.dataset.sizeIndex) === String(sizeIndex)) return row;
    }
    return null;
  }

  // Add to order from menu card
  // メニューのカードで選んである入数のまま、その「品×入数」の行の数を1つ増やす。
  // カートの正は行の数字（.order-qty-num）1か所。カード側は別の入れ物を持たない。
  function addToOrder(productName) {
    const ad = findCardAdd(productName);
    // 行が0になった直後の押しまちがい防止（「− 数 ＋」が「カートに追加」に戻った瞬間の連打）
    if (ad && !lastInputByKeyboard && Date.now() < (ad._holdUntil || 0)) return;
    const row = findOrderRow(productName, getCardSizeIndex(productName));
    if (!row) return;
    setRowQty(row, getRowQty(row) + 1);
    // 「カートに追加」は「− 数 ＋」に変わるので、キーボードの位置を「＋」へ渡す
    const plus = ad && ad.querySelector('.stp .sb[data-d="1"]');
    if (plus) plus.focus({ preventScroll: true });
  }

  // 送料無料達成のお祝い。離島の自動判定は別対応とし、既存の送料判定に合わせる
  // （2026-11-05 管理人確認：北海道・沖縄のみ除外）。住所未確定では出さない。
  // 金額を下げても再演出せず、注文完了後の resetOrderForm() で次の注文に戻す。
  let freeShippingCelebrated = false;
  let shippingCelebrationRequest = 0;
  let shippingConfettiActive = false;
  let shippingConfettiCanvas = null;
  let shippingConfettiFrame = 0;
  let shippingAddressPending = false;
  let reviewedOrder = null;
  let orderSubmissionInProgress = false;

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // 紙吹雪の絵は自前（外の部品は読み込まない）。朱と金の小さな紙片が、下の帯の上あたりから1回だけ舞う。
  // 出す・出さないの決まり（お届け先が分かってから・1注文に1回）は updateShippingCelebration のまま。
  function drawShippingConfetti() {
    if (shippingConfettiCanvas) return;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return;
    const W = window.innerWidth, H = window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pieces = [];
    const TICKS = 125;
    let tick = 0, last = 0;
    canvas.className = 'kami';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.width = W * ratio; canvas.height = H * ratio;
    ctx.scale(ratio, ratio);
    document.body.appendChild(canvas);
    shippingConfettiCanvas = canvas;
    for (let i = 0; i < 55; i++) {
      const angle = (-90 + (Math.random() - 0.5) * 65) * Math.PI / 180;
      pieces.push({ x: W / 2, y: H * 0.72, vx: Math.cos(angle), vy: Math.sin(angle),
        v: 25 * (0.5 + Math.random() * 0.5), w: Math.random() * 6.28, s: 0.1 + Math.random() * 0.2,
        color: i % 2 ? '#FFD27A' : '#B02A26', size: 4 + Math.random() * 3 });
    }
    function step(now) {
      if (shippingConfettiCanvas !== canvas) return;
      // 1秒60コマより速い画面でも同じ速さ
      if (now - last < 15) { shippingConfettiFrame = requestAnimationFrame(step); return; }
      last = now; tick++;
      ctx.clearRect(0, 0, W, H);
      pieces.forEach(p => {
        p.x += p.vx * p.v; p.y += p.vy * p.v + 3; p.v *= 0.9; p.w += p.s;
        const flip = Math.abs(Math.cos(p.w * 1.7));
        ctx.globalAlpha = Math.max(1 - tick / TICKS, 0);
        ctx.fillStyle = p.color;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.w);
        ctx.fillRect(-p.size / 2, -p.size * flip / 2, p.size, Math.max(p.size * flip, 1));
        ctx.restore();
      });
      if (tick < TICKS) shippingConfettiFrame = requestAnimationFrame(step);
      else clearShippingConfettiCanvas();
    }
    shippingConfettiFrame = requestAnimationFrame(step);
  }

  function clearShippingConfettiCanvas() {
    if (!shippingConfettiCanvas) return;
    cancelAnimationFrame(shippingConfettiFrame);
    if (shippingConfettiCanvas.parentNode) shippingConfettiCanvas.parentNode.removeChild(shippingConfettiCanvas);
    shippingConfettiCanvas = null;
  }

  function loadShippingConfetti() {
    return Promise.resolve(drawShippingConfetti);
  }

  function stopShippingConfetti() {
    shippingCelebrationRequest += 1; // 待ちの間に数量・住所が変わった場合も取り消す
    if (shippingConfettiActive) clearShippingConfettiCanvas();
    shippingConfettiActive = false;
  }

  function updateShippingCelebration(subtotal, ship) {
    const eligible = !shippingAddressPending && subtotal >= FREE_SHIPPING_LINE
      && ship.pref && !ship.separate && ship.fee === 0;
    if (!eligible) {
      stopShippingConfetti();
      return false;
    }
    if (!freeShippingCelebrated) {
      freeShippingCelebrated = true;
      const requestId = ++shippingCelebrationRequest;
      if (!prefersReducedMotion()) {
        loadShippingConfetti().then(confetti => {
          // 読み込み中の変更や注文完了で、古い注文のお祝いを遅れて出さない。
          const currentSubtotal = getOrderSubtotal();
          const currentShip = calcShipping(currentSubtotal);
          if (requestId !== shippingCelebrationRequest || shippingAddressPending
              || document.hidden || prefersReducedMotion()
              || currentSubtotal < FREE_SHIPPING_LINE || !currentShip.pref
              || currentShip.separate || currentShip.fee !== 0) return;
          shippingConfettiActive = true;
          confetti();
        }).catch(() => {}); // 演出の失敗で注文・送料表示を止めない
      }
    }
    return true;
  }

  // ============================================================
  // カートの見た目（メニューのカード・選んだ品の行・伝票・短冊の印）
  // どれも「行の数字」を読んで描くだけ。お金の計算・送る中身には関わらない。
  // ============================================================
  const MAX_ROW_QTY = 99;          // 1行（1品×1入数）の上限
  const ROW_MISTAP_HOLD_MS = 450;  // 行・カードの数が0になった直後、続けて押しても効かない時間（押しまちがい防止）
  let lastInputByKeyboard = false; // 直前の操作がキーボードか（キーボードの時は押しまちがい防止を掛けない）
  let rowHoldUntil = 0;
  let slipSeen = {};               // 伝票に書いてある行（新しく入った行だけ、書き足す動きを付ける）
  let cartViewReady = false;       // 開いた時の1回目は動き・読み上げを付けない

  // メニューのカードの「カートに追加」の置き場（.ad）
  function findCardAdd(productName) {
    const ads = document.querySelectorAll('.card .ad');
    for (const ad of ads) { if (ad.dataset.add === productName) return ad; }
    return null;
  }
  // カードでいま選んである入数（何番目か）
  function getCardSizeIndex(productName) {
    const ad = findCardAdd(productName);
    const card = ad && ad.closest('.card');
    if (!card) return 0;
    const sizes = Array.prototype.slice.call(card.querySelectorAll('.sz'));
    return Math.max(sizes.indexOf(card.querySelector('.sz.on')), 0);
  }
  // 行の呼び名（読み上げ・カードの「カートに ○個入×1」用）。例「肉焼売【生冷凍】 8個入」
  function getRowLabel(row) {
    return getRowProductName(row) + ' ' + (row.dataset.sizeLabel || '');
  }
  // 伝票・読み上げ用の1行（buildOrderPayload の明細と同じ文面を、折れない塊に分けたもの。値段は含まない）
  // tests/test_top_line_items.cjs が「つなげると buildOrderPayload の明細と同じ」を見張る。
  function getRowSlipParts(row, qty) {
    const name = getRowProductName(row);
    if (row.classList.contains('has-tea-size')) {
      const bags = parseInt(row.dataset.teaBags) || 1;
      return [name + ' ', bags + '袋セット', '（計' + (bags * TEA_PIECES_PER_BAG) + '個）' + (qty > 1 ? ' × ' + qty : '')];
    }
    if (row.classList.contains('has-unit-size')) {
      return [name + ' ', (row.dataset.unit || '') + ' × ' + qty];
    }
    if (row.classList.contains('has-size')) {
      const pieces = getRowPieces(row);
      return [name + ' ', pieces + '個入 × ' + qty + '袋', '（計' + (pieces * qty) + '個）'];
    }
    return [name + ' × ' + qty + '（' + row.dataset.unit + '）'];
  }

  // メニューのカード1枚：いま選んである入数の数が入っていれば「− 数 ＋」、無ければ「カートに追加」。
  // 下に、その品でカートに入っている組み合わせ（例「カートに 生冷凍 4個入×1・8個入×2」）。
  function renderCard(card) {
    const sizes = Array.prototype.slice.call(card.querySelectorAll('.sz'));
    const on = card.querySelector('.sz.on');
    const index = Math.max(sizes.indexOf(on), 0);
    const hint = card.querySelector('.sz-hint');
    if (hint && on && on.dataset.h) hint.textContent = on.dataset.h;
    const incart = card.querySelector('.incart');
    const ads = card.querySelectorAll('.ad');
    let count = 0, last = null, selected = false;
    if (incart) incart.textContent = '';
    ads.forEach(ad => {
      const name = ad.dataset.add;
      const addBtn = ad.querySelector('.add');
      let stp = ad.querySelector('.stp');
      const tag = ads.length > 1 && addBtn ? addBtn.textContent.replace(/^＋\s*/, '') : '';
      if (!stp) {
        // その場の「− 数 ＋」を、追加ボタンの置き場の中に作っておく（数が入るまでは隠す）
        stp = document.createElement('div');
        stp.className = 'stp'; stp.hidden = true; stp.setAttribute('role', 'group');
        stp.innerHTML = '<button type="button" class="sb" data-d="-1" onclick="changeCardQty(this,-1)">−</button>'
          + '<span class="sn"><b>0</b></span>'
          + '<button type="button" class="sb" data-d="1" onclick="changeCardQty(this,1)">＋</button>';
        if (tag) {
          const small = document.createElement('small');
          small.textContent = tag;
          stp.querySelector('.sn').insertBefore(small, stp.querySelector('.sn b'));
        }
        ad.appendChild(stp);
      }
      const row = findOrderRow(name, index);
      const qty = row ? getRowQty(row) : 0;
      const label = row ? getRowLabel(row) : name;
      if (addBtn) addBtn.hidden = qty > 0;
      stp.hidden = !qty;
      stp.querySelector('.sn b').textContent = qty;
      stp.setAttribute('aria-label', label + 'の数量');
      stp.querySelector('.sb[data-d="-1"]').setAttribute('aria-label', label + (qty > 1 ? 'を1つ減らす' : 'を取り消す'));
      stp.querySelector('.sb[data-d="1"]').setAttribute('aria-label', label + 'を1つ増やす');
      sizes.forEach((_, i) => {
        const r = findOrderRow(name, i);
        const q = r ? getRowQty(r) : 0;
        if (!q || !incart) return;
        selected = true;
        // 塊ごとに折る。区切りの「・」は前の塊の終わりに付ける（行の頭に「・」は来られないため）
        if (last) last.textContent += '・';
        last = document.createElement('span');
        last.className = 'nw';
        last.textContent = (count ? '' : 'カートに ') + (tag ? tag + ' ' : '') + (r.dataset.sizeLabel || '') + '×' + q;
        incart.appendChild(last);
        count++;
      });
    });
    if (incart) incart.hidden = !count;
    // カートに入った品には朱の丸：その品の番号札と、短冊の札の両方に
    card.classList.toggle('sel', selected);
    if (card.id) {
      document.querySelectorAll('.tz').forEach(tz => {
        if (tz.getAttribute('href') === '#' + card.id) tz.classList.toggle('sel', selected);
      });
    }
  }

  // メニューのカード・短冊・入数ボタンの値段を、注文フォームの行（値段の正）から書く。
  // 価格同期のあとに呼ぶ。ザーサイ・モンゴル茶は行が実額を持つので、同じやり方で行の値段がそのまま出る。
  function renderCardPrices() {
    document.querySelectorAll('.card').forEach(card => {
      const ad = card.querySelector('.ad');
      if (!ad) return;
      const name = ad.dataset.add;
      card.querySelectorAll('.sz').forEach((btn, i) => {
        const row = findOrderRow(name, i);
        if (!row) return;
        const unit = row.classList.contains('has-tea-size') ? (parseInt(row.dataset.teaBags) || 1) + '袋'
          : row.classList.contains('has-unit-size') ? (row.dataset.unit || '')
          : getRowPieces(row) + '個';
        const text = unit + ' ¥' + getRowPrice(row).toLocaleString();
        // 「お得」「最安」の札（span）は残して、先頭の文字だけ書き換える
        if (btn.firstChild && btn.firstChild.nodeType === 3) btn.firstChild.nodeValue = text;
        else btn.insertBefore(document.createTextNode(text), btn.firstChild);
        btn.dataset.t = text;
      });
      const base = findOrderRow(name, 0);
      if (!base || !base.classList.contains('has-size')) return;
      const priceEl = card.querySelector('.price');
      if (priceEl) {
        const s = priceEl.querySelector('s'), b = priceEl.querySelector('b'), small = priceEl.querySelector('small');
        const orig = parseInt(base.dataset.origPrice) || 0;
        if (s && orig) s.textContent = '¥' + (orig * getRowMultiplier(base)).toLocaleString();
        if (b) b.textContent = '¥' + getRowPrice(base).toLocaleString();
        if (small) small.textContent = '/ ' + getRowPieces(base) + '個（税込）';
      }
      if (card.id) {
        document.querySelectorAll('.tz').forEach(tz => {
          const p = tz.getAttribute('href') === '#' + card.id ? tz.querySelector('.tz-price') : null;
          if (p) p.textContent = '¥' + getRowPrice(base).toLocaleString();
        });
      }
    });
  }

  // 選んだ品の行・カード・伝票を、行の数字に合わせて描き直す（updateFloatingCart から毎回呼ばれる）
  function renderCartView(subtotal, ship) {
    const root = document.documentElement;
    const slip = document.getElementById('slipItems');
    const now = {};
    let any = false;
    if (slip) slip.textContent = '';
    document.querySelectorAll('.order-product-row').forEach(row => {
      const qty = getRowQty(row);
      const key = getRowProductName(row) + '|' + row.dataset.sizeIndex;
      // 数が0の行は隠す＝「選んだ品だけ」が見える
      if (qty > 0 && row.hidden && cartViewReady && !prefersReducedMotion()) row.classList.add('new');
      if (qty === 0) row.classList.remove('new');
      row.hidden = qty === 0;
      // 数が1の時の「−」は、取り消すのと同じ働き（読み上げの名前もそう変える）
      const minus = row.querySelector('.sb[data-d="-1"]');
      if (minus) minus.setAttribute('aria-label', getRowLabel(row) + (qty > 1 ? 'を1つ減らす' : 'を取り消す'));
      if (qty === 0) return;
      any = true;
      now[key] = 1;
      if (!slip) return;
      // 伝票の1行：品名はそのまま、入数と個数は「途中で折れない塊」にして入れる
      const li = document.createElement('li'), text = document.createElement('span'), price = document.createElement('span');
      const parts = getRowSlipParts(row, qty);
      text.appendChild(document.createTextNode(parts[0]));
      for (let i = 1; i < parts.length; i++) {
        const nw = document.createElement('span');
        nw.className = 'nw'; nw.textContent = parts[i];
        text.appendChild(nw);
      }
      price.textContent = '¥' + (getRowPrice(row) * qty).toLocaleString();
      li.appendChild(text); li.appendChild(price);
      if (cartViewReady && !slipSeen[key]) li.className = 'new';
      slip.appendChild(li);
    });
    slipSeen = now;
    const empty = document.getElementById('orderEmpty');
    if (empty) empty.hidden = any;
    document.querySelectorAll('.card').forEach(renderCard);

    // 伝票の小計・送料（合計金額・案内文・代引き手数料は updateTotal が書く）
    const subEl = document.getElementById('slipSub');
    if (subEl) subEl.textContent = '¥' + subtotal.toLocaleString();
    const shipEl = document.getElementById('slipShip');
    if (shipEl) {
      shipEl.textContent = subtotal === 0 ? '-'
        : ship.separate ? '別途ご案内'
        : ship.fee === null ? '郵便番号の入力後に計算'
        : ship.fee === 0 ? '無料'
        : '¥' + ship.fee.toLocaleString();
    }
    // 送料無料までの目盛り（帯の上の細い線・伝票の線）
    root.style.setProperty('--free', Math.min(subtotal / FREE_SHIPPING_LINE, 1).toFixed(3));
    // 伝票の中だけ送れる時（背の低い画面）：キーボードでも送れるようにする
    const scroll = document.getElementById('slipScroll');
    if (scroll) {
      if (scroll.scrollHeight > scroll.clientHeight + 1) {
        scroll.setAttribute('tabindex', '0'); scroll.setAttribute('role', 'group'); scroll.setAttribute('aria-label', 'ご注文の明細');
      } else {
        scroll.removeAttribute('tabindex'); scroll.removeAttribute('role'); scroll.removeAttribute('aria-label');
      }
    }
    // 帯の高さ（右下の Instagram・LINE のボタンが帯に重ならないように top.css が使う）
    const cart = document.getElementById('floatingCart');
    if (cart) root.style.setProperty('--cb', (any ? cart.offsetHeight : 0) + 'px');
    syncCartBarLabel();
    cartViewReady = true;
  }

  function updateFloatingCart() {
    let totalQty = 0;
    let totalPrice = 0;
    document.querySelectorAll('.order-product-row').forEach(row => {
      const qty = parseInt(row.querySelector('.order-qty-num').textContent);
      const price = getRowPrice(row);
      totalQty += qty;
      totalPrice += price * qty;
    });
    document.getElementById('floatingCartCount').textContent = totalQty;
    document.getElementById('floatingCartTotal').textContent = '¥' + totalPrice.toLocaleString();
    // 送料無料の判定は既存の送料計算と同じ商品小計・お届け先を使う。
    const ship = calcShipping(totalPrice);
    const freeShipping = updateShippingCelebration(totalPrice, ship);
    const shippingMessage = totalQty === 0 ? ''
      : totalPrice < MIN_ORDER_SUBTOTAL
        ? 'ご注文は税込¥' + MIN_ORDER_SUBTOTAL.toLocaleString() + 'から（あと¥' + (MIN_ORDER_SUBTOTAL - totalPrice).toLocaleString() + '）'
      : ship.separate ? '送料は別途ご案内します'
      : totalPrice < FREE_SHIPPING_LINE
        ? '送料無料まで あと¥' + (FREE_SHIPPING_LINE - totalPrice).toLocaleString()
        : freeShipping ? '送料無料になりました'
        : '対象地域は送料無料です';
    const shippingEl = document.getElementById('floatingCartShipping');
    if (shippingEl.textContent !== shippingMessage) shippingEl.textContent = shippingMessage;
    // 帯は、商品を1つ以上選ぶと出る
    document.getElementById('floatingCart').classList.toggle('off', totalQty === 0);
    renderCartView(totalPrice, ship);
  }
  window.addEventListener('resize', updateFloatingCart);

  // 固定バーは注文を送信せず、入力の続き・最後の送信ボタンへ案内する。
  function getOrderProgressTarget() {
    if (getOrderSubtotal() < MIN_ORDER_SUBTOTAL) {
      return document.getElementById('orderTotalBox');
    }
    const form = document.getElementById('orderForm');
    for (const field of form.querySelectorAll('input, select, textarea')) {
      // 自動入力専用の住所が空なら、編集できる郵便番号欄へ戻す。
      if (field.id === 'orderAddress' && !field.value.trim()) {
        return document.getElementById('orderZip');
      }
      if (field.willValidate && !field.validity.valid) return field;
    }
    return document.getElementById('orderSubmitBtn');
  }

  // 選んだ品の確認の場所（#orderItems）の頭が、下の帯より120px以上うえに見えている（または過ぎた）
  // ＝お客様はもう注文フォームの中にいる。
  function isOrderFormInView() {
    const items = document.getElementById('orderItems');
    const cart = document.getElementById('floatingCart');
    if (!items || !cart) return false;
    return items.getBoundingClientRect().top <= cart.getBoundingClientRect().top - 120;
  }

  // 帯のボタンの文字：注文フォームの中にいて合計が足りている間は「注文内容を確認する」
  // （押すと何が起きるかを先に見せる）。フォームより上では「注文へ進む」。
  let cartBarConfirm = false;
  function syncCartBarLabel() {
    const cart = document.getElementById('floatingCart');
    const label = cart && cart.querySelector('.cb-t');
    if (!label) return;
    // 小さいスマホで一番上にいる間、帯が題字に掛かるなら引っ込める（少し送れば出る）
    const name = document.querySelector('.hero-title .name'), cta = document.querySelector('.hero-cta a');
    if (name && cta) {
      const bottom = Math.max(name.getBoundingClientRect().bottom, cta.getBoundingClientRect().bottom);
      cart.classList.toggle('lo', window.innerWidth <= 820 && bottom > 0 && bottom > window.innerHeight - cart.offsetHeight);
    }
    const on = isOrderFormInView() && getOrderSubtotal() >= MIN_ORDER_SUBTOTAL;
    if (on === cartBarConfirm) return;
    cartBarConfirm = on;
    // 幅の狭い画面では「注文内容を／確認する」の2行に組む（top.css）。言葉の途中では折れない
    if (on) label.innerHTML = '<span class="nw">注文内容を</span><span class="nw">確認する</span>';
    else label.textContent = '注文へ進む';
    cart.classList.toggle('cf', on);
    if (!cart.classList.contains('off')) document.documentElement.style.setProperty('--cb', cart.offsetHeight + 'px');
  }

  // 行き先を画面に出す（カーソルも入れる）。なめらかな移動が途中で止まった時は、少し待って直接移す。
  // その間にお客様が自分で画面を動かした・打ち始めた時は何もしない。
  function bringOrderTargetIntoView(target) {
    const waiting = target.closest('.wait');
    if (waiting) waiting.classList.remove('wait');
    if (target.id !== 'orderTotalBox') target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
    let moved = false;
    const onMove = () => { moved = true; };
    ['touchstart', 'wheel', 'keydown'].forEach(name => window.addEventListener(name, onMove, { passive: true, once: true }));
    setTimeout(() => {
      if (moved) return;
      const cart = document.getElementById('floatingCart');
      const rect = target.getBoundingClientRect();
      if (rect.top < 70 || rect.bottom > window.innerHeight - (cart ? cart.offsetHeight : 0)) {
        target.scrollIntoView({ behavior: 'auto', block: 'center' });
      }
    }, 1100);
  }

  // 帯のボタン。押せば必ず1歩先へ進む（注文は送らない）：
  //  ① 選んだ品の確認の場所がまだ画面より下にある時 → そこへ（移動そのものはリンクのまま）
  //  ② そこを見ている・過ぎている時 → 合計が足りなければ合計の伝票へ／必須の欄に空きがあれば最初の空き欄へ／
  //     全部埋まっていれば「注文内容を確認する」を押したのと同じ（確認画面が開く。確定は確認画面のボタンだけ）
  function proceedToOrder(event) {
    if (!isOrderFormInView()) {
      const items = document.getElementById('orderItems');
      if (items) {
        setTimeout(() => {
          const rect = items.getBoundingClientRect();
          if (rect.top < 40 || rect.top > window.innerHeight * 0.5) items.scrollIntoView({ behavior: 'auto', block: 'start' });
        }, 1300);
      }
      return;
    }
    event.preventDefault();
    const target = getOrderProgressTarget();
    if (!target) return;
    if (target.id === 'orderSubmitBtn') {
      // 確認画面を開く（「注文内容を確認する」と同じ道＝フォームの決まりの点検を通る）
      target.click();
      return;
    }
    bringOrderTargetIntoView(target);
  }

  // Order form logic
  // 行（1品×1入数）の数を決める。0 になった行は隠れる（＝カートから外れる）。
  // 数を変えるのは必ずここを通す（合計・帯・カード・伝票が一緒に変わる）。
  function setRowQty(row, qty) {
    const numEl = row.querySelector('.order-qty-num');
    const subEl = row.querySelector('.order-subtotal');
    const price = getRowPrice(row);
    if (qty < 0) qty = 0;
    if (qty > MAX_ROW_QTY) qty = MAX_ROW_QTY;
    numEl.textContent = qty;
    if (qty > 0) {
      subEl.textContent = '¥' + (price * qty).toLocaleString();
      subEl.classList.add('has-value');
    } else {
      subEl.textContent = '-';
      subEl.classList.remove('has-value');
    }
    updateTotal();
    updateFloatingCart();
    announceCartChange(row, qty);
    return qty;
  }

  // 読み上げ：変えた品の一行（伝票と同じ文）＋合計＋送料の案内を、1か所でまとめて伝える。画面にある言葉をつないだだけ。
  function announceCartChange(row, qty) {
    const cart = document.getElementById('floatingCart');
    if (cart && !prefersReducedMotion()) {
      cart.classList.remove('bump'); void cart.offsetWidth; cart.classList.add('bump');
    }
    const live = document.getElementById('srLive');
    if (!live) return;
    const said = qty > 0
      ? getRowSlipParts(row, qty).join('') + ' ¥' + (getRowPrice(row) * qty).toLocaleString() + '。'
      : getRowLabel(row) + ' 0。';
    live.textContent = said + '合計金額 ' + document.getElementById('orderTotal').textContent + '。'
      + document.getElementById('floatingCartShipping').textContent;
  }

  // 行の数を変える。行が消える時は、キーボードの位置を隣の行（無ければ「メニューへ戻る」）へ渡す。
  function changeRowQty(row, qty, focusSelector) {
    if (!lastInputByKeyboard && Date.now() < rowHoldUntil) return;
    const hadFocus = row.contains(document.activeElement);
    const visible = Array.prototype.slice.call(document.querySelectorAll('.order-product-row')).filter(r => !r.hidden);
    const at = visible.indexOf(row);
    const neighbor = visible[at + 1] || visible[at - 1] || null;
    if (setRowQty(row, qty) !== 0) return;
    rowHoldUntil = Date.now() + ROW_MISTAP_HOLD_MS;
    if (!hadFocus) return;
    const empty = document.getElementById('orderEmpty');
    const next = neighbor ? neighbor.querySelector(focusSelector) : (empty && empty.querySelector('a'));
    if (next) next.focus({ preventScroll: true });
  }

  // 選んだ品の行の「−」「＋」
  function changeQty(btn, delta) {
    const row = btn.closest('.order-product-row');
    changeRowQty(row, getRowQty(row) + delta, '.sb');
  }

  // 選んだ品の行の「取り消す」
  function removeOrderRow(btn) {
    changeRowQty(btn.closest('.order-product-row'), 0, '.pk-x');
  }

  // メニューのカードの「− 数 ＋」（カードでいま選んである入数の行を増減する）
  function changeCardQty(btn, delta) {
    const ad = btn.closest('.ad');
    if (!ad) return;
    const row = findOrderRow(ad.dataset.add, getCardSizeIndex(ad.dataset.add));
    if (!row) return;
    if (setRowQty(row, getRowQty(row) + delta) === 0) {
      // 「− 数 ＋」が「カートに追加」に戻る。続けて押しても、すぐには足さない（押しまちがい防止）
      ad._holdUntil = Date.now() + ROW_MISTAP_HOLD_MS;
      const addBtn = ad.querySelector('.add');
      if (addBtn) addBtn.focus({ preventScroll: true });
    }
  }

  // ポイント残高チェック（電話番号入力時）
  let customerPoints = 0;
  let customerMemberId = '';
  const phoneInput = document.getElementById('orderPhone');
  let pointCheckTimer = null;
  phoneInput.addEventListener('input', function() {
    clearTimeout(pointCheckTimer);
    const phone = this.value.replace(/[\s\-\(\)]/g, '');
    if (phone.length >= 10) {
      pointCheckTimer = setTimeout(() => lookupPoints(phone), 600);
    } else {
      hidePointUseBox();
    }
  });

  function lookupPoints(phone) {
    fetch(HP_CONFIG.apiBase + '/orders/api/point-check?phone=' + encodeURIComponent(phone))
      .then(r => r.json())
      .then(data => {
        if (data.found && data.total_points > 0) {
          customerPoints = data.total_points;
          customerMemberId = data.member_id;
          document.getElementById('pointAvailable').textContent = '残高: ' + customerPoints + 'pt（' + data.name + '様）';
          document.getElementById('pointUseAmount').max = customerPoints;
          document.getElementById('pointUseAmount').value = 0;
          document.getElementById('pointUseBox').style.display = '';
          // 会員番号も自動入力
          if (customerMemberId) {
            document.getElementById('orderMemberId').value = customerMemberId;
          }
          applyPointDiscount();
        } else {
          hidePointUseBox();
        }
      })
      .catch(() => hidePointUseBox());
  }

  function hidePointUseBox() {
    customerPoints = 0;
    customerMemberId = '';
    document.getElementById('pointUseBox').style.display = 'none';
    document.getElementById('pointUseAmount').value = 0;
    applyPointDiscount();
  }

  const MIN_POINT_USE = 50; // サーバー側 order_mgmt/hp_order.py の MIN_POINT_USE と同じ

  // 「合計金額」欄（＝商品小計＋送料＋代引き手数料。ポイント割引前）を数値で読む
  function getOrderTotalNum() {
    const totalText = document.getElementById('orderTotal').textContent;
    return parseInt(totalText.replace(/[^\d]/g, '')) || 0;
  }

  // 実際に使えるポイント数（残高上限・合計金額上限・50pt下限）。
  // サーバー側 resolve_usable_points と同じルール。最終判断はサーバーが行うが、
  // 画面表示をサーバーの請求額と食い違わせないため同じ計算をここでも行う。
  function resolveUsablePoints(requested) {
    const points = parseInt(requested) || 0;
    if (points < MIN_POINT_USE) return 0;
    const capped = Math.min(points, customerPoints, getOrderTotalNum());
    return capped >= MIN_POINT_USE ? capped : 0;
  }

  function useAllPoints() {
    const maxUse = Math.min(customerPoints, getOrderTotalNum());
    document.getElementById('pointUseAmount').value = maxUse >= MIN_POINT_USE ? maxUse : 0;
    applyPointDiscount();
  }

  function applyPointDiscount() {
    const inputEl = document.getElementById('pointUseAmount');
    const infoEl = document.getElementById('pointDiscountInfo');
    const textEl = document.getElementById('pointDiscountText');
    const useAmount = parseInt(inputEl.value) || 0;
    const total = getOrderTotalNum();

    // バリデーション: 残高を超える／合計金額を超える入力はその場で丸める
    // （合計を超えるとお支払い金額がマイナスになってしまうため）
    const upperLimit = total > 0 ? Math.min(customerPoints, total) : customerPoints;
    if (useAmount > upperLimit) {
      inputEl.value = upperLimit;
      applyPointDiscount();
      return;
    }

    if (useAmount > 0 && useAmount < MIN_POINT_USE) {
      infoEl.style.display = '';
      textEl.innerHTML = '※ 50pt以上から利用可能です';
      infoEl.classList.add('low');
      return;
    }

    const applied = resolveUsablePoints(useAmount);
    if (applied >= MIN_POINT_USE) {
      infoEl.style.display = '';
      // 割引額だけでなく「実際にお支払いいただく金額」まで見せる
      // （2026-07-26: 合計欄は割引前のままなので、ここで必ず明示する）
      textEl.innerHTML = '−¥' + applied.toLocaleString() + ' ポイント割引適用'
        + '<br>お支払い金額: ¥' + Math.max(total - applied, 0).toLocaleString();
      infoEl.classList.remove('low');
    } else {
      infoEl.style.display = 'none';
    }
  }

  // 郵便番号自動検索
  const zipInput = document.getElementById('orderZip');
  const addressInput = document.getElementById('orderAddress');
  zipInput.addEventListener('input', function() {
    // 郵便番号の変更中は前の住所を使ってお祝いしない（送料計算自体は従来どおり）。
    shippingAddressPending = true;
    updateFloatingCart();
    let zip = this.value.replace(/[^0-9]/g, '');
    if (zip.length >= 3 && zip.length <= 7 && !this.value.includes('-')) {
      this.value = zip.slice(0, 3) + (zip.length > 3 ? '-' + zip.slice(3) : '');
    }
    if (zip.length === 7) {
      fetch('https://zipcloud.ibsnet.co.jp/api/search?zipcode=' + zip)
        .then(r => r.json())
        .then(data => {
          if (data.results) {
            const r = data.results[0];
            addressInput.value = r.address1 + r.address2 + r.address3;
            shippingAddressPending = zipInput.value.replace(/[^0-9]/g, '') !== zip;
            addressInput.focus();
            // 住所（都道府県）が決まったので送料を再計算して合計に反映する
            updateTotal();
          }
        })
        .catch(() => {});
    }
  });

  function updatePaymentOptions() {
    const delivery = document.getElementById('orderDelivery').value;
    const codOption = document.getElementById('codOption');
    const paymentSelect = document.getElementById('orderPayment');
    const paymentNote = document.getElementById('paymentNote');
    if (delivery === 'yamato' || delivery === 'yamato_ambient') {
      codOption.style.display = '';
      codOption.disabled = false;
    } else {
      codOption.style.display = 'none';
      codOption.disabled = true;
      if (paymentSelect.value === 'cod') {
        paymentSelect.value = 'bank';
      }
    }
    // 支払い方法が変わった可能性があるので、代引き手数料込みの合計を作り直す
    updateTotal();
    updateCardPaymentUI();
  }

  // ============================================================
  // クレジットカード決済（Stripe Payment Element）
  // 画面遷移せず、このページの中でカード入力〜決済完了まで完結させる。
  // ============================================================
  const PAYMENT_API_BASE = HP_CONFIG.apiBase + '/payment';
  // PayPay等「一度その決済画面へ移動して戻ってくる」支払い方法の戻り先ページ。
  // カード決済はこのページ内で完結するので、ここには戻ってこない。
  // 戻ってきた画面では注文を確定させない（確定はサーバー側のWebhookのみ）。
  const PAYMENT_RETURN_URL = window.location.origin + '/order-complete/';
  // ============================================================
  // 送料の自動計算（税込・2026-07-18 社長承認の新体系）
  //  ・冷凍便・常温便とも: 全国一律 ¥1,200（同日中に常温便も一律化で統一）
  //  ・北海道・沖縄・離島宛: 実費が一律額を大きく超えるため
  //    金額はここでは確定させず「別途ご案内」（注文自体は受け付ける）
  //  ・商品小計 税込¥8,000以上で送料無料（北海道・沖縄・離島を除く）
  //  ・最低注文金額: 税込¥2,000（商品小計）
  // ※ 旧・地域別送料（常温便用 PREF_SHIPPING_FEES）は 2026-07-18 に廃止。
  //   送料は1注文につき1回だけ加算（冷凍・常温の混在でも二重取りしない）。
  // ============================================================
  // 送料無料ラインを変更するときに一緒に確認する8か所（検索語: 8,000 / 8000）:
  // 1. app.js: この FREE_SHIPPING_LINE（送料計算・固定バーの残額計算）
  // 2. app.js: buildOrderPayload() の「送料 無料」明細
  // 3. app.js: SHIPPING_DEFAULT_NOTE（商品未選択時の送料案内）
  // 4. app.js: updateTotal() の住所未入力・ライン達成時の案内
  // 5. app.js: updateTotal() の送料無料確定時の案内
  // 6. index.html: order-shipping-banner-title（注文フォーム冒頭）
  // 7. index.html: orderShipping（JS更新前の初期表示）
  // 8. tokushoho.html: 送料の注記
  // 併せて催事管理アプリ側のHP受注・決済APIの金額設定も確認すること。
  const FREE_SHIPPING_LINE = 8000;
  const MIN_ORDER_SUBTOTAL = 2000; // 最低注文金額（税込・商品小計）
  const UNIFORM_SHIPPING_FEE = 1200; // 冷凍便・常温便とも 全国一律（税込）
  // 送料を「別途ご案内」にする地域（実費が一律額を大きく超える）
  const SEPARATE_QUOTE_PREFS = ['北海道', '沖縄県'];
  // 都道府県の判定用リスト（住所欄の先頭一致に使う）
  const PREFECTURES = [
    '北海道',
    '青森県', '岩手県', '秋田県', '宮城県', '山形県', '福島県',
    '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県', '山梨県',
    '新潟県', '長野県',
    '富山県', '石川県', '福井県', '静岡県', '愛知県', '岐阜県', '三重県',
    '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
    '鳥取県', '島根県', '岡山県', '広島県', '山口県',
    '徳島県', '香川県', '愛媛県', '高知県',
    '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県',
    '沖縄県',
  ];

  // ============================================================
  // 代金引換（クロネコヤマト）の手数料（税込・2026-07-12 社長承認の確定額）
  // 「代引きで渡す金額」＝商品小計＋送料の合計に応じて決まる。
  //  ・1万円未満: ¥330 ／ 1万円以上〜3万円未満: ¥440 ／ 3万円以上〜10万円未満: ¥660
  // 送料無料ライン（¥8,000以上）の判定は商品小計のみで行い、代引き手数料は
  // その判定には一切関係させない（送料無料でも代引き手数料は別途かかる）。
  // ============================================================
  function calcCodFee(subtotal, shipFee) {
    if (shipFee === null || shipFee === undefined) return null; // 送料未確定＝代引き手数料も未確定
    const base = subtotal + shipFee;
    if (base <= 0) return 0;
    if (base < 10000) return 330;
    if (base < 30000) return 440;
    return 660; // 3万円以上10万円未満（10万円以上の区分は未確定のため同額を適用）
  }

  // お届け先の都道府県を住所欄（郵便番号→zipcloudの自動入力）から判定する。
  // 住所欄は readonly（自動入力のみ）なので、値は必ず「都道府県名から始まる」形。
  function getDestPrefecture() {
    const addrEl = document.getElementById('orderAddress');
    const addr = addrEl ? String(addrEl.value || '').trim() : '';
    if (!addr) return null;
    for (const pref of PREFECTURES) {
      if (addr.startsWith(pref)) return pref;
    }
    return null; // 判定不能（住所未入力など）
  }

  // 商品小計から送料を計算する。
  // 戻り値: { pref: 都道府県名 or null,
  //          fee: 送料（無料=0、未確定=null）,
  //          separate: true=北海道・沖縄・離島宛で「別途ご案内」 }
  function calcShipping(subtotal) {
    const pref = getDestPrefecture();
    if (!pref) return { pref: null, fee: null, separate: false };
    // 冷凍便・常温便とも: 全国一律¥1,200（税込）。北海道・沖縄・離島は実費が
    // 大きく超えるため金額を確定させず「別途ご案内」（注文は受け付ける）。
    if (SEPARATE_QUOTE_PREFS.includes(pref)) {
      return { pref: pref, fee: null, separate: true };
    }
    if (subtotal >= FREE_SHIPPING_LINE) {
      return { pref: pref, fee: 0, separate: false };
    }
    return { pref: pref, fee: UNIFORM_SHIPPING_FEE, separate: false };
  }

  // 商品小計（送料・ポイント割引を含まない、商品だけの合計）
  function getOrderSubtotal() {
    let subtotal = 0;
    document.querySelectorAll('.order-product-row').forEach(row => {
      const qty = parseInt(row.querySelector('.order-qty-num').textContent);
      const price = getRowPrice(row);
      subtotal += price * qty;
    });
    return subtotal;
  }
  let stripeInstance = null;
  let stripeElements = null;
  let stripePaymentElement = null;
  let currentClientSecret = null;
  let mountedPayloadJson = ''; // いま表示中のカード入力欄（PaymentIntent）が対応している注文内容
  let cardRemountTimer = null; // 注文内容変更時の再マウント用（連打・入力中対策のデバウンス）
  let cardChargeQuote = null; // 確認画面でもサーバーが返した請求額を照合する

  function getStripe() {
    if (!stripeInstance && window.Stripe && HP_CONFIG.stripeKey) {
      stripeInstance = window.Stripe(HP_CONFIG.stripeKey);
    }
    return stripeInstance;
  }

  function showCardError(msg) {
    const cardError = document.getElementById('cardPaymentError');
    if (cardError) {
      cardError.style.display = '';
      cardError.textContent = msg;
    }
  }

  function clearCardError() {
    const cardError = document.getElementById('cardPaymentError');
    if (cardError) { cardError.style.display = 'none'; cardError.textContent = ''; }
  }

  // カードに実際に請求される金額の表示（サーバーが確定した金額をそのまま出す）
  function showCardChargeAmount(amount, orderTotal, pointsUsed) {
    cardChargeQuote = { amount, orderTotal, pointsUsed };
    const el = document.getElementById('cardChargeAmount');
    if (!el) return;
    let html = 'このカードへのご請求額:<b>¥' + Number(amount).toLocaleString() + '</b>';
    if (pointsUsed > 0) {
      html += '<small>（ご注文合計 ¥' + Number(orderTotal).toLocaleString()
        + ' − ポイント ' + Number(pointsUsed).toLocaleString() + 'pt）</small>';
    }
    el.innerHTML = html;
    el.style.display = '';
  }

  function hideCardChargeAmount() {
    const el = document.getElementById('cardChargeAmount');
    if (el) { el.style.display = 'none'; el.innerHTML = ''; }
  }

  function unmountCardPaymentElement() {
    cardChargeQuote = null;
    if (stripePaymentElement) {
      stripePaymentElement.unmount();
      stripePaymentElement = null;
    }
    stripeElements = null;
    currentClientSecret = null;
    mountedPayloadJson = '';
    hideCardChargeAmount();
  }

  function updateCardPaymentUI() {
    const paymentSelect = document.getElementById('orderPayment');
    const cardBox = document.getElementById('cardPaymentBox');
    if (!paymentSelect || !cardBox) return;
    if (paymentSelect.value !== 'credit') {
      cardBox.style.display = 'none';
      // カード決済をやめて別の支払い方法に切り替えた場合、Payment Elementを破棄
      unmountCardPaymentElement();
      return;
    }
    cardBox.style.display = '';
    // 最低注文金額（税込¥2,000）に満たない間はカード入力欄を出さない。
    const cardSubtotal = getOrderSubtotal();
    if (cardSubtotal > 0 && cardSubtotal < MIN_ORDER_SUBTOTAL) {
      unmountCardPaymentElement();
      showCardError('ご注文は税込¥2,000から承っております。お手数ですが商品を追加してください。');
      return;
    }
    // お届け先の都道府県が分かるまでは送料（＝カード課金額）が確定しないため、
    // カード入力欄は出さずに案内だけ表示する（送料抜きで課金してしまう事故の防止）。
    if (cardSubtotal > 0 && !getDestPrefecture()) {
      unmountCardPaymentElement();
      showCardError('郵便番号をご入力いただき住所が表示されると、送料を含めた合計金額でお支払い欄が表示されます。');
      return;
    }
    // 北海道・沖縄・離島宛は送料が「別途ご案内」＝課金額が確定しないため、
    // その場でお金をいただく決済（カード・PayPay等）は受け付けない。
    // ※ PayPayは2026-08-06にStripe経由へ移行したため、この制限がPayPayにも及ぶ。
    //   ご案内先は銀行振込（と、クロネコヤマト便なら代金引換）のみ。
    if (cardSubtotal > 0 && calcShipping(cardSubtotal).separate) {
      unmountCardPaymentElement();
      showCardError('北海道・沖縄・離島宛は送料を別途ご案内するため、この画面でのお支払い（クレジットカード・PayPay）はご利用いただけません。お手数ですが銀行振込をお選びください。');
      return;
    }
    // カード選択時点でPaymentIntentを作りPayment Elementを表示する
    // （お客様が「送信する」を押す前にカード番号を入力できるようにするため）。
    // buildOrderPayload() が同期的に例外を投げても必ず画面に表示する
    // （引数の評価は同期なので、.catch だけではサイレントに死ぬ）。
    let payload;
    try {
      payload = buildOrderPayload();
    } catch (err) {
      showCardError('カード入力欄の準備に失敗しました。ページを再読み込みしてお試しください。（' + (err.message || err) + '）');
      return;
    }
    // サーバー側の必須条件（商品・お名前・電話番号）が揃うまでは案内だけ表示する
    // （揃わないままPaymentIntentを作りに行くと400エラーになるため）
    if (!payload.items.length || !String(payload.name).trim() || !String(payload.phone).trim()) {
      unmountCardPaymentElement();
      showCardError('商品の選択と、お名前・電話番号のご入力が済むと、ここにお支払い欄が表示されます。');
      return;
    }
    // すでに同じ注文内容でマウント済みなら何もしない（入力中のカード番号を消さない）
    const payloadJson = JSON.stringify(payload);
    if (stripePaymentElement && mountedPayloadJson === payloadJson) return;
    clearCardError();
    mountCardPaymentElement(payload).catch(err => {
      showCardError(err.message || 'カード入力欄の読み込みに失敗しました。');
    });
  }

  // 商品数量や入力内容が変わったときにカード入力欄を作り直す（カード決済選択中のみ）。
  // サーバーに記録される注文内容はPaymentIntent作成時の内容なので、
  // 入力欄表示後の変更を必ず反映させる。連打・入力中はデバウンスでまとめる。
  function scheduleCardRemount() {
    const paymentSelect = document.getElementById('orderPayment');
    if (!paymentSelect || paymentSelect.value !== 'credit') return;
    clearTimeout(cardRemountTimer);
    cardRemountTimer = setTimeout(updateCardPaymentUI, 1000);
  }

  // 注文フォーム内のどの項目が変わっても再マウント判定にかける
  // （updateCardPaymentUI 側で内容が同じなら何もしないので安全）。
  // ※ Stripeのカード入力はiframe内なので、カード番号入力ではこのイベントは発生しない。
  const orderFormEl = document.getElementById('orderForm');
  if (orderFormEl) {
    orderFormEl.addEventListener('input', scheduleCardRemount);
    orderFormEl.addEventListener('change', scheduleCardRemount);
    orderFormEl.addEventListener('click', scheduleCardRemount);
  }

  function buildOrderPayload() {
    const items = [];
    // サーバーが金額を計算し直すための明細（2026-11 PR-4）。
    // 送るのは「どの商品を・どのサイズで・いくつ」だけで、値段は入れない
    // （値段と送料はサーバーが自分の台帳から計算し、items・total と突き合わせる）。
    // 形を変えるときは催事アプリ側 order_mgmt/hp_pricing.py と
    // tests/test_line_items.cjs（黄金テスト）も一緒に直すこと。
    const lineItems = [];
    document.querySelectorAll('.order-product-row').forEach(row => {
      const qty = parseInt(row.querySelector('.order-qty-num').textContent);
      if (qty > 0) {
        // 画面の文字ではなく data-product-name から（翻訳されても元の日本語を送る）
        const name = getRowProductName(row);
        const price = getRowPrice(row);
        const subtotal = '¥' + (price * qty).toLocaleString();
        lineItems.push({
          name: name,
          qty: qty,
          multiplier: row.classList.contains('has-size') ? getRowMultiplier(row) : null,
          size: row.classList.contains('has-unit-size') ? (row.dataset.unit || '') : null,
          tea_bags: row.classList.contains('has-tea-size') ? (parseInt(row.dataset.teaBags) || 1) : null,
        });
        if (row.classList.contains('has-tea-size')) {
          const bags = parseInt(row.dataset.teaBags) || 1;
          const pieces = bags * TEA_PIECES_PER_BAG;
          const setLabel = name + ' ' + bags + '袋セット（計' + pieces + '個）';
          if (qty > 1) {
            items.push(setLabel + ' × ' + qty + ' ' + subtotal);
          } else {
            items.push(setLabel + ' ' + subtotal);
          }
        } else if (row.classList.contains('has-unit-size')) {
          // 例「ザーサイ 280g × 2 ¥2,960」
          items.push(name + ' ' + (row.dataset.unit || '') + ' × ' + qty + ' ' + subtotal);
        } else if (row.classList.contains('has-size')) {
          const pieces = getRowPieces(row);
          const totalPieces = pieces * qty;
          items.push(name + ' ' + pieces + '個入 × ' + qty + '袋（計' + totalPieces + '個）' + subtotal);
        } else {
          const unit = row.dataset.unit;
          items.push(name + ' × ' + qty + '（' + unit + '） ' + subtotal);
        }
      }
    });
    // 送料も明細の1行として入れる（注文記録・確認メール・LINE通知にそのまま出る）
    const orderSubtotal = getOrderSubtotal();
    const shipInfo = calcShipping(orderSubtotal);
    if (shipInfo.separate) {
      items.push('送料 別途ご案内（' + shipInfo.pref + '宛・実費送料を後日ご連絡）');
    } else if (shipInfo.fee > 0) {
      items.push('送料（' + shipInfo.pref + '宛） ¥' + shipInfo.fee.toLocaleString());
    } else if (shipInfo.fee === 0) {
      items.push('送料 無料（税込¥8,000以上）');
    }
    // 代金引換の場合のみ、代引き手数料も明細の1行として入れる
    if (document.getElementById('orderPayment').value === 'cod') {
      const codFee = calcCodFee(orderSubtotal, shipInfo.fee);
      if (codFee) {
        items.push('代引き手数料 ¥' + codFee.toLocaleString());
      }
    }
    const total = document.getElementById('orderTotal').textContent;
    const name = document.getElementById('orderName').value;
    const phone = document.getElementById('orderPhone').value;
    const email = document.getElementById('orderEmail').value;
    const zip = document.getElementById('orderZip').value;
    const banchi = document.getElementById('orderBanchi').value;
    const building = document.getElementById('orderBuilding').value;
    const address = '〒' + zip + ' ' + document.getElementById('orderAddress').value + banchi + (building ? ' ' + building : '');
    const deliveryMap = { sagawa: '佐川急便（冷凍便）', yamato: 'クロネコヤマト（冷凍便）', sagawa_ambient: '佐川急便（常温便）', yamato_ambient: 'クロネコヤマト（常温便）' };
    const delivery = deliveryMap[document.getElementById('orderDelivery').value];
    // credit … カード／PayPay／Apple Pay等をまとめた「その場でお支払い」の枠。
    //   実際にどれで支払われたかは、決済確定後にサーバー側（Stripeの記録）で
    //   確かめて注文に書き込むので、ここは代表名のままでよい。
    // paypay … 2026-08-06に選択肢からは外した（Stripe経由へ移行）。ただし
    //   古いページが残っているお客様の端末から送られてくる可能性があるため、
    //   従来どおり「PayPay」（＝手作業でご案内する運用）として受けられるよう残す。
    const paymentMap = { bank: '銀行振込', credit: 'クレジットカード', paypay: 'PayPay', cod: '代金引換（クロネコヤマト）' };
    const payment = paymentMap[document.getElementById('orderPayment').value];
    const date = document.getElementById('orderDate').value || '指定なし';
    const note = document.getElementById('orderNote').value || 'なし';
    const member_id = document.getElementById('orderMemberId').value.trim();
    // 残高上限・合計金額上限・50pt下限を通した「実際に使えるポイント数」を送る。
    // サーバー側も同じルール（resolve_usable_points）で再判定するので、
    // ここが多少ズレても請求額と減算額が食い違うことはない。
    const validUsePoints = resolveUsablePoints(
      document.getElementById('pointUseAmount').value
    );
    return { items, total, name, phone, email, address, delivery, payment, date, note, member_id, use_points: validUsePoints, line_items: lineItems };
  }

  // 完了画面の「注文内容」。文字はすべて文字として入れる（お名前・ご住所をHTMLとして解釈させない）。
  // pending＝オンライン決済（カード・PayPay）の「決済を確認しています」の出し方。
  function renderOrderCompleteSummary(orderData, pending) {
    const summary = document.getElementById('orderCompleteSummary');
    summary.textContent = '';
    const add = (tag, text, parent = summary) => {
      const el = document.createElement(tag);
      el.textContent = text;
      parent.appendChild(el);
      return el;
    };
    add('h3', pending ? 'ご注文内容' : '注文内容');
    const items = add('ul', '');
    orderData.items.forEach(item => add('li', item, items));
    const info = add('dl', '');
    const row = (label, value, className) => {
      add('dt', label, info);
      const dd = add('dd', value, info);
      if (className) dd.className = className;
      return dd;
    };
    row('合計', orderData.total, 'sum');
    if (orderData.use_points > 0) {
      // 実際にお支払いいただく金額（＝合計 − ポイント）を明示する
      const totalNum = parseInt(String(orderData.total).replace(/[^\d]/g, '')) || 0;
      row('ポイント利用', '−¥' + orderData.use_points.toLocaleString(), 'pt-used');
      if (pending) row('ご請求額', '¥' + Math.max(totalNum - orderData.use_points, 0).toLocaleString());
      else row('お支払い金額', '¥' + (totalNum - orderData.use_points).toLocaleString());
    }
    const dest = row('お届け先', '');
    dest.appendChild(document.createTextNode(orderData.name + '様'));
    dest.appendChild(document.createElement('br'));
    dest.appendChild(document.createTextNode(orderData.address));
    row('配送', orderData.delivery);
    row('お支払い', orderData.payment);
    if (pending) {
      const note = add('p', '決済を確認しています。確認が取れ次第、メールでご連絡いたします。');
      note.className = 'done-pend';
    }
  }

  // 完了画面を出す（送信中の画面と同じ dialog の中で切り替わる）
  function openOrderComplete() {
    setOrderFlow('done');
    const title = document.getElementById('orderCompleteTitle');
    if (title) title.focus({ preventScroll: true });
  }

  function showOrderCompleteScreen(orderData, respData) {
    hideOrderProcessingOverlay();
    renderOrderCompleteSummary(orderData, false);

    if (respData && respData.point_info) {
      const ptMatch = respData.point_info.match(/\+(\d+)pt.*残高:\s*(\d+)pt.*会員#(\d+)/);
      if (ptMatch) {
        document.getElementById('orderPointEarned').textContent = ptMatch[1];
        document.getElementById('orderPointBalance').textContent = '残高: ' + ptMatch[2] + 'pt（会員番号: #' + ptMatch[3] + '）';
        document.getElementById('orderCompletePoint').style.display = '';
      }
    }

    const orderLineBox = document.getElementById('orderCompleteLineLink');
    if (orderLineBox && respData && respData.line_linked === false) {
      orderLinkPhone = respData.phone || orderData.phone.replace(/[\s\-\(\)]+/g, '');
      orderLineBox.style.display = '';
    } else if (orderLineBox) {
      orderLineBox.style.display = 'none';
    }

    openOrderComplete();
    resetOrderForm();
  }

  function showOrderCompletePending(orderData) {
    // オンライン決済（カード・PayPay）はWebhook確定を待つため、断定的な完了ではなく
    // 「確認中」の趣旨で表示する（実際の入金確定はサーバー側Webhookで行う）。
    hideOrderProcessingOverlay();
    renderOrderCompleteSummary(orderData, true);
    openOrderComplete();
    resetOrderForm();
  }

  const CARD_INCOMPLETE_MSG = 'お支払いが完了していません。お支払い情報を入力して、お支払いを完了してください'
    + '（お支払い欄が表示されない場合は、お手数ですが別の支払い方法をお選びください）';

  // カード決済の準備（create-intent）に失敗したときの文言。
  // サーバーが理由を返している場合（ポイント利用額が多すぎる等）はそれを優先して伝える。
  function cardPrepErrorMsg(err) {
    const detail = err && err.message ? String(err.message) : '';
    if (detail) {
      return detail + '（ご注文はまだ送信されていません）';
    }
    return 'カード決済の準備ができなかったため、ご注文は送信されていません。'
      + 'しばらくしてもう一度お試しいただくか、お手数ですが別の支払い方法をお選びください。';
  }

  async function handleCardPaymentSubmit(orderData, submitBtn, orderErrorBox) {
    const cardError = document.getElementById('cardPaymentError');
    if (cardError) { cardError.style.display = 'none'; cardError.textContent = ''; }

    // 決済を止めてエラーを表示する共通処理。
    // カード決済では、どんな失敗でも通常注文（/orders/api/hp-order）への
    // フォールバック送信は絶対に行わない。
    function stopWithCardError(msg) {
      hideOrderProcessingOverlay();
      submitBtn.disabled = false;
      submitBtn.textContent = '注文内容を確認する';
      if (cardError) {
        cardError.style.display = '';
        cardError.textContent = msg;
        cardError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (orderErrorBox) {
        orderErrorBox.style.display = '';
        orderErrorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        alert(msg);
      }
    }

    // 最低注文金額（税込¥2,000）未満はカード決済もしない。
    // updateCardPaymentUI側の入口チェックとは別に、ここでも二重に止める。
    const submitSubtotal = getOrderSubtotal();
    if (submitSubtotal < MIN_ORDER_SUBTOTAL) {
      unmountCardPaymentElement();
      stopWithCardError('ご注文は税込¥2,000から承っております。お手数ですが商品を追加してください。');
      return;
    }

    // 送料（＝課金額）が確定しないままカード決済はしない。
    if (!getDestPrefecture()) {
      unmountCardPaymentElement();
      stopWithCardError('お届け先の郵便番号・ご住所をご入力ください。送料を含めた合計金額でカード決済を行います。');
      return;
    }

    // 北海道・沖縄・離島宛（送料 別途ご案内）はカード・PayPayとも決済不可。
    if (calcShipping(submitSubtotal).separate) {
      unmountCardPaymentElement();
      stopWithCardError('北海道・沖縄・離島宛は送料を別途ご案内するため、この画面でのお支払い（クレジットカード・PayPay）はご利用いただけません。お手数ですが銀行振込をお選びください。');
      return;
    }

    // Payment Elementがまだ描画されていない＝カード情報を入力できていない状態。
    // ここで決済準備をやり直し、成功しても「入力してから再度送信」を促して必ず止める。
    if (!stripePaymentElement) {
      try {
        await mountCardPaymentElement(orderData);
      } catch (err) {
        // create-intent失敗（サーバー障害・502、ポイント利用額が多すぎる等）。
        // 注文は送信しない。サーバーからの具体的な理由があればそれを見せる。
        stopWithCardError(cardPrepErrorMsg(err));
        return;
      }
      stopWithCardError(CARD_INCOMPLETE_MSG);
      return;
    }

    // 入力欄を出した後に注文内容（金額・お届け先・希望日・ポイント等）が変わっている場合は、
    // 古い内容のまま決済・注文記録しないよう作り直して止める
    if (mountedPayloadJson !== JSON.stringify(orderData)) {
      try {
        await mountCardPaymentElement(orderData);
      } catch (err) {
        stopWithCardError(cardPrepErrorMsg(err));
        return;
      }
      stopWithCardError('ご注文内容が変わったため、カード情報をもう一度入力して、送信し直してください。');
      return;
    }

    try {
      const stripe = getStripe();
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements: stripeElements,
        // redirect:'if_required' … カードはこの画面のまま完結し、
        // PayPayのように移動が必要な支払い方法のときだけ画面が移動する。
        // return_url は移動が必要な支払い方法のために必須（カードでは使われない）。
        redirect: 'if_required',
        confirmParams: { return_url: PAYMENT_RETURN_URL },
      });

      if (error) {
        // カード番号未入力・入力途中などはStripeが validation_error を返す
        if (error.type === 'validation_error') {
          stopWithCardError(CARD_INCOMPLETE_MSG);
        } else {
          stopWithCardError('決済に失敗しました。もう一度お試しいただくか、別の支払い方法をお選びください。');
        }
        return;
      }

      if (paymentIntent && (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing')) {
        // 決済自体はここで完了。正式な注文確定はサーバーのWebhookが行うため、
        // ここでは「確認中」の完了画面を出す。
        showOrderCompletePending(orderData);
      } else {
        stopWithCardError(CARD_INCOMPLETE_MSG);
      }
    } catch (err) {
      stopWithCardError('決済に失敗しました。もう一度お試しいただくか、別の支払い方法をお選びください。');
    }
  }

  async function mountCardPaymentElement(orderData) {
    // 手元（テスト用の鍵が無い時）・確認用ページでは、お支払い欄を作らない（催事アプリにも尋ねない）。
    await HP_CONFIG.ready;
    if (!HP_CONFIG.stripeKey) throw new Error(HP_CONFIG.blockedMessage);
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('決済モジュールの読み込みに失敗しました。ページを再読み込みしてください。'
        + '（広告ブロッカー等の拡張機能が原因の場合があります）');
    }
    let res;
    try {
      res = await fetch(PAYMENT_API_BASE + '/create-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      });
    } catch (err) {
      // ネットワークエラー（"Failed to fetch"）を日本語で分かる文言に置き換える
      throw new Error('通信エラーでカード決済の準備ができませんでした。電波状況をご確認のうえ、もう一度お試しください。');
    }
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || '決済の準備に失敗しました');
    }
    const data = await res.json();
    // 古い入力欄が残っていたら破棄してから新しく作る（金額変更時の再マウント）
    unmountCardPaymentElement();
    currentClientSecret = data.client_secret;

    // locale: 'ja' … 表示を日本語に固定（ブラウザ言語まかせにしない）
    // theme: 'night' … サイトの黒背景でもラベル・入力欄が読めるダーク配色。色は top.css の金（--gold）・地（--panel）に合わせる
    stripeElements = stripe.elements({
      clientSecret: currentClientSecret,
      locale: 'ja',
      appearance: {
        theme: 'night',
        variables: {
          colorPrimary: '#FFD27A',
          colorBackground: '#16161C',
          colorText: '#EDEBE6',
          colorDanger: '#FF9C94',
          fontSizeBase: '16px',
          borderRadius: '2px',
        },
      },
    });
    stripePaymentElement = stripeElements.create('payment');
    stripePaymentElement.mount('#payment-element');
    mountedPayloadJson = JSON.stringify(orderData);
    // サーバーが確定した「実際にカードへ請求される金額」を必ず画面に出す。
    // ポイント利用分はサーバー側で差し引かれている（2026-07-26 修正）。
    if (typeof data.amount === 'number') {
      showCardChargeAmount(data.amount, data.order_total, data.points_used || 0);
    }
  }

  const SHIPPING_DEFAULT_NOTE = '※ 送料 全国一律¥1,200（税込・冷凍便／常温便とも）／税込¥8,000以上で送料無料／北海道・沖縄・離島は送料を別途ご案内／ご注文は税込¥2,000から';

  function updateTotal() {
    const subtotal = getOrderSubtotal();
    const ship = calcShipping(subtotal);
    const paymentEl = document.getElementById('orderPayment');
    const paymentValue = paymentEl ? paymentEl.value : '';
    const codFee = paymentValue === 'cod' ? calcCodFee(subtotal, ship.fee) : null;
    // 合計金額 ＝ 商品小計 ＋ 送料 ＋（代金引換の場合のみ）代引き手数料
    // （送料・代引き手数料が未確定の間はそれぞれ加算しない）
    const total = subtotal + (ship.fee || 0) + (codFee || 0);
    document.getElementById('orderTotal').textContent = '¥' + total.toLocaleString();
    // 最低注文金額（税込¥2,000）未満の間は送信ボタンを押せない
    document.getElementById('orderSubmitBtn').disabled = orderSubmissionInProgress || subtotal < MIN_ORDER_SUBTOTAL;

    const shippingEl = document.getElementById('orderShipping');
    shippingEl.classList.remove('free');
    const subLabel = '商品小計 ¥' + subtotal.toLocaleString();
    if (subtotal === 0) {
      shippingEl.textContent = SHIPPING_DEFAULT_NOTE;
    } else if (subtotal < MIN_ORDER_SUBTOTAL) {
      const minRemain = MIN_ORDER_SUBTOTAL - subtotal;
      shippingEl.textContent = subLabel + ' ／ ご注文は税込¥2,000から承っております（あと¥' + minRemain.toLocaleString() + '）';
    } else if (ship.separate) {
      // 北海道・沖縄・離島宛: 送料は確定させず別途ご案内（冷凍便・常温便とも）
      shippingEl.textContent = subLabel + ' ／ ' + ship.pref + '宛の送料は別途ご案内いたします（ご注文確認後にご連絡します）';
    } else if (ship.fee === null) {
      // 住所（都道府県）が未確定 → 送料はまだ足せない
      if (subtotal >= FREE_SHIPPING_LINE) {
        shippingEl.textContent = subLabel + ' ／ 送料は郵便番号のご入力後に自動計算されます（¥8,000以上は送料無料。※北海道・沖縄・離島は送料を別途ご案内します）';
      } else {
        const remain = FREE_SHIPPING_LINE - subtotal;
        shippingEl.textContent = subLabel + ' ／ あと¥' + remain.toLocaleString() + 'で送料無料（北海道・沖縄・離島を除く）／ 送料は郵便番号のご入力後に自動計算されます';
      }
    } else if (ship.fee === 0) {
      shippingEl.textContent = subLabel + ' ＋ 送料無料（¥8,000以上）';
      shippingEl.classList.add('free');
    } else {
      const remain = FREE_SHIPPING_LINE - subtotal;
      shippingEl.textContent = subLabel + ' ＋ 送料 ¥' + ship.fee.toLocaleString() + '（' + ship.pref + '宛）／ あと¥' + remain.toLocaleString() + 'で送料無料';
    }

    // 代引き手数料の内訳行（代金引換以外では非表示。送料は送料無料でも手数料は別途かかる）
    const codFeeEl = document.getElementById('orderCodFee');
    if (codFeeEl) {
      if (paymentValue === 'cod' && subtotal > 0) {
        codFeeEl.style.display = '';
        if (codFee === null) {
          codFeeEl.textContent = ship.separate
            ? '代引き手数料は送料のご案内とあわせてご連絡いたします'
            : '代引き手数料は郵便番号のご入力後に確定します';
        } else {
          codFeeEl.textContent = '代引き手数料 ¥' + codFee.toLocaleString();
        }
      } else {
        codFeeEl.style.display = 'none';
        codFeeEl.textContent = '';
      }
    }

    // 合計が変わるとポイントの上限（合計金額まで）とお支払い金額の表示も変わるので
    // 必ず引き直す（applyPointDiscount は updateTotal を呼ばないので再帰しない）。
    applyPointDiscount();

    // カード決済選択中に金額が変わったら、決済金額を合わせるため入力欄を作り直す
    scheduleCardRemount();
    // 郵便番号によるお届け先の変更でも、固定バーの送料案内を更新する。
    updateFloatingCart();
  }

  // 送信中オーバーレイの表示・非表示（ボタン文字の変化だけでは気付きにくいため、
  // 画面全体を覆って「送信して処理が進んでいる」ことをハッキリ伝える）。
  // 送信中 → 完了は1つの dialog（#orderFlowDialog）の中で切り替える。
  // mode: 'sending'＝送信中 ／ 'done'＝完了 ／ null＝閉じる
  function setOrderFlow(mode) {
    const flow = document.getElementById('orderFlowDialog');
    const sending = document.getElementById('orderProcessingOverlay');
    const done = document.getElementById('orderCompleteOverlay');
    if (sending) sending.hidden = mode !== 'sending';
    if (done) done.hidden = mode !== 'done';
    if (!flow) return;
    const open = flow.hasAttribute('open');
    if (!mode) {
      if (open) {
        if (typeof flow.close === 'function' && !flow.classList.contains('flow-inline')) flow.close();
        else flow.removeAttribute('open');
      }
      flow.classList.remove('flow-inline');
      return;
    }
    flow.setAttribute('aria-label', mode === 'done' ? 'ご注文の完了' : 'ご注文の送信');
    // 送信中は showModal() を使わない（ページの上に重ねるだけ＝flow-inline）。
    // showModal() で開いた dialog はブラウザの「いちばん上の層」に入り、その外は見えても押せなくなる。
    // カードの本人確認（3Dセキュア）の画面は Stripe がページの本体に差し込むので、
    // 送信中の幕を showModal() で出すと、本人確認の画面が幕の後ろに回って押せなくなる。
    // 完了画面は Stripe の出番が終わった後なので、今までどおり showModal() で出す。
    const inline = mode === 'sending' || typeof flow.showModal !== 'function';
    let opened = open;
    if (opened && flow.classList.contains('flow-inline') !== inline) {
      // 重ね方を替える時（送信中 → 完了）は、一度閉じてから開き直す。
      if (flow.classList.contains('flow-inline') || typeof flow.close !== 'function') flow.removeAttribute('open');
      else flow.close();
      flow.classList.remove('flow-inline');
      opened = false;
    }
    if (!opened) {
      if (inline) {
        // 暗幕の上に重ねて出す（dialog未対応の端末も同じ出し方）。
        flow.classList.add('flow-inline');
        flow.setAttribute('open', '');
      } else {
        flow.showModal();
      }
    }
    flow.scrollTop = 0;
  }
  function isOrderFlowMode(mode) {
    const flow = document.getElementById('orderFlowDialog');
    const el = document.getElementById(mode === 'done' ? 'orderCompleteOverlay' : 'orderProcessingOverlay');
    return !!flow && flow.hasAttribute('open') && !!el && !el.hidden;
  }
  (function guardOrderFlowDialog() {
    const flow = document.getElementById('orderFlowDialog');
    if (!flow) return;
    // Esc：送信中は閉じさせない。完了画面は「閉じる」と同じ。
    flow.addEventListener('cancel', event => {
      event.preventDefault();
      if (isOrderFlowMode('done')) closeOrderComplete();
    });
  })();

  // 送信中の表示・非表示（ボタン文字の変化だけでは気付きにくいため、
  // 画面全体を覆って「送信して処理が進んでいる」ことをハッキリ伝える）。
  function showOrderProcessingOverlay() {
    setOrderFlow('sending');
  }
  function hideOrderProcessingOverlay() {
    if (isOrderFlowMode('sending')) setOrderFlow(null);
    orderSubmissionInProgress = false;
    const submitBtn = document.getElementById('orderSubmitBtn');
    submitBtn.disabled = getOrderSubtotal() < MIN_ORDER_SUBTOTAL;
    submitBtn.textContent = '注文内容を確認する';
  }

  function closeOrderReview() {
    reviewedOrder = null;
    const inline = orderReviewDialog.classList.contains('order-review-inline');
    if (inline) {
      orderReviewDialog.removeAttribute('open');
      orderReviewDialog.removeAttribute('role');
      orderReviewDialog.classList.remove('order-review-inline');
      document.getElementById('orderSubmitBtn').focus();
    } else {
      orderReviewDialog.close();
    }
    document.body.classList.remove('order-review-open');
    document.body.classList.remove('order-review-inline-open');
  }

  // 確認画面の「ポイントを使う」案内を出すかどうか。
  // 出すのは「今回ポイントを使っていない」かつ「照会済みの残高が利用条件（50pt）以上」のときだけ。
  // 残高は照会結果の変数から読む（画面の文字からは読まない＝ブラウザの翻訳で壊れない）。
  // 未照会・照会失敗・該当なしは hidePointUseBox() で残高 0・枠は非表示になっている。
  function shouldShowReviewPointGuide(usePoints) {
    if (usePoints > 0) return false;
    if (!(customerPoints >= MIN_POINT_USE)) return false;
    const box = document.getElementById('pointUseBox');
    return !!box && box.style.display !== 'none';
  }

  // 確認画面の「ポイントを使う」ボタン。
  // 戻り方は「戻って修正する」と同じ closeOrderReview() をそのまま使い、
  // そのあと入力画面のポイントの枠を見える位置に出して入力欄にカーソルを置くだけ。
  // ポイント数は入れない（お客様が決める）。金額・送信・決済の流れには触れない。
  function goToPointUseFromReview() {
    closeOrderReview();
    const box = document.getElementById('pointUseBox');
    const input = document.getElementById('pointUseAmount');
    if (!box || !input || box.style.display === 'none') return;
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input.focus({ preventScroll: true });
    // 入っている「0」を選んだ状態にして、打った数字がそのまま入るようにする
    // （選ばないと「0」の前に打ち込まれて 100 のつもりが 1000 になる端末がある）。数字そのものは変えない。
    try { input.select(); } catch (e) { /* 選べない端末ではカーソルを置くだけ */ }
  }

  const orderReviewDialog = document.getElementById('orderReviewDialog');
  function isOrderReviewOpen() {
    return orderReviewDialog.hasAttribute('open');
  }
  orderReviewDialog.addEventListener('cancel', event => {
    event.preventDefault();
    closeOrderReview();
  });
  orderReviewDialog.addEventListener('close', () => {
    if (!isOrderReviewOpen()) {
      reviewedOrder = null;
      document.body.classList.remove('order-review-open');
      document.body.classList.remove('order-review-inline-open');
    }
  });

  function getOrderReviewDetails() {
    const form = document.getElementById('orderForm');
    if (!form.checkValidity()) {
      if (isOrderReviewOpen()) closeOrderReview();
      form.reportValidity();
      return null;
    }
    const subtotal = getOrderSubtotal();
    if (subtotal < MIN_ORDER_SUBTOTAL) {
      if (isOrderReviewOpen()) closeOrderReview();
      alert('ご注文は税込2,000円から承っております。お手数ですが商品を追加してください。');
      return null;
    }
    const ship = calcShipping(subtotal);
    if (shippingAddressPending || !ship.pref) {
      if (isOrderReviewOpen()) closeOrderReview();
      alert('郵便番号から住所が表示されたことをご確認ください。');
      document.getElementById('orderZip').focus();
      return null;
    }
    const payload = buildOrderPayload();
    const online = document.getElementById('orderPayment').value === 'credit'
      || payload.payment === 'クレジットカード';
    const cod = document.getElementById('orderPayment').value === 'cod';
    const codFee = cod ? calcCodFee(subtotal, ship.fee) : 0;
    const total = getOrderTotalNum();
    const amount = Math.max(total - payload.use_points, 0);
    if (online && (ship.separate || !stripePaymentElement
        || mountedPayloadJson !== JSON.stringify(payload) || !cardChargeQuote
        || cardChargeQuote.amount !== amount || cardChargeQuote.orderTotal !== total
        || cardChargeQuote.pointsUsed !== payload.use_points)) {
      if (isOrderReviewOpen()) closeOrderReview();
      updateCardPaymentUI();
      showCardError(ship.separate
        ? '送料を別途ご案内するお届け先です。銀行振込など、別のお支払い方法をお選びください。'
        : 'お支払い欄の準備と金額をご確認のうえ、もう一度「注文内容を確認する」を押してください。金額が一致しない場合はページを再読み込みしてください。');
      document.getElementById('cardPaymentBox').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return null;
    }
    return { payload, subtotal, ship, codFee, cod, total, amount, online };
  }

  function renderOrderReview(details, changed = false) {
    const summary = document.getElementById('orderReviewSummary');
    summary.textContent = '';
    const add = (tag, text, parent = summary) => {
      const el = document.createElement(tag);
      el.textContent = text;
      parent.appendChild(el);
      return el;
    };
    const yen = value => '¥' + value.toLocaleString();
    add('h3', 'ご注文の明細');
    const items = add('ul', '');
    details.payload.items.forEach(item => add('li', item, items));
    const totals = add('dl', '');
    totals.className = 'tot';
    const row = (parent, label, value) => {
      add('dt', label, parent);
      add('dd', value, parent);
    };
    row(totals, '商品小計（税込）', yen(details.subtotal));
    row(totals, '送料', details.ship.separate ? '別途ご案内' : yen(details.ship.fee));
    if (details.cod) row(totals, '代引き手数料', details.codFee === null ? '別途ご案内' : yen(details.codFee));
    row(totals, 'ポイント利用', details.payload.use_points > 0
      ? details.payload.use_points.toLocaleString() + 'pt（−' + yen(details.payload.use_points) + '）' : '利用なし');
    if (shouldShowReviewPointGuide(details.payload.use_points)) {
      // 「ポイント利用」の行のすぐ下に、表の幅いっぱいで案内を出す。
      const guide = add('dd', '', totals);
      guide.className = 'rev-pt';
      add('span', 'ポイントが ' + customerPoints.toLocaleString() + 'pt あります（'
        + MIN_POINT_USE + 'ptからご利用いただけます）', guide);
      const guideBtn = add('button', 'ポイントを使う', guide);
      guideBtn.type = 'button';
      guideBtn.className = 'rev-pt-b';
      guideBtn.addEventListener('click', goToPointUseFromReview);
    }
    row(totals, details.ship.separate ? '現時点の金額（税込）' : 'お支払い金額（税込）', yen(details.amount));
    if (details.ship.separate) {
      add('p', '送料' + (details.cod ? '・代引き手数料' : '') + 'は上記金額に含まれていません。最終金額は別途ご案内します。');
    }
    add('h3', 'お届け先・お支払い');
    const info = add('dl', '');
    row(info, 'お名前', details.payload.name);
    row(info, '電話番号', details.payload.phone);
    row(info, 'メールアドレス', details.payload.email || '未入力');
    row(info, 'お届け先', details.payload.address);
    row(info, '配送方法', details.payload.delivery);
    row(info, 'お支払い方法', details.online ? 'クレジットカード・PayPay' : details.payload.payment);
    row(info, '希望日（目安）', details.payload.date);
    if (details.payload.member_id) row(info, '会員番号', details.payload.member_id);
    row(info, '備考', details.payload.note);
    const finalBtn = document.getElementById('orderConfirmBtn');
    finalBtn.textContent = details.online ? yen(details.amount) + 'を支払う'
      : details.ship.separate ? '送料別途で注文を確定する' : 'この内容で注文を確定する';
    finalBtn.disabled = false;
    document.getElementById('orderReviewChanged').textContent = changed
      ? 'ご注文内容が変わりました。変更後の内容をご確認のうえ、もう一度確定してください。' : '';
    reviewedOrder = details;
    summary.scrollTop = 0;
    if (!isOrderReviewOpen()) {
      if (typeof orderReviewDialog.showModal === 'function') {
        orderReviewDialog.showModal();
        document.body.classList.add('order-review-open');
      } else {
        // dialog未対応の端末でも即送信せず、フォーム直下で同じ内容を確認する。
        orderReviewDialog.classList.add('order-review-inline');
        orderReviewDialog.setAttribute('role', 'region');
        orderReviewDialog.setAttribute('open', '');
        document.body.classList.add('order-review-inline-open');
      }
    }
    orderReviewDialog.scrollTop = 0;
    document.getElementById('orderReviewTitle').focus({ preventScroll: true });
    if (orderReviewDialog.classList.contains('order-review-inline')) {
      orderReviewDialog.scrollIntoView({ block: 'start' });
    }
  }

  function handleOrderSubmit(e) {
    e.preventDefault();
    if (orderSubmissionInProgress) return;
    updateTotal();
    const details = getOrderReviewDetails();
    if (details) renderOrderReview(details);
  }

  function confirmReviewedOrder() {
    if (!reviewedOrder || orderSubmissionInProgress || !isOrderReviewOpen()) return;
    updateTotal();
    const current = getOrderReviewDetails();
    if (!current) return;
    // 価格同期・郵便番号照会などで確認中に変わった内容を、未確認のまま送らない。
    if (JSON.stringify(current) !== JSON.stringify(reviewedOrder)) {
      renderOrderReview(current, true);
      return;
    }
    const orderData = reviewedOrder.payload;
    document.getElementById('orderConfirmBtn').disabled = true;
    closeOrderReview();
    submitReviewedOrder(orderData);
  }

  function submitReviewedOrder(orderData) {
    if (orderSubmissionInProgress) return;
    const submitBtn = document.getElementById('orderSubmitBtn');

    // 最低注文金額（税込¥2,000）未満は受け付けない
    // （ボタンはupdateTotalで無効化済みだが、念のためここでも二重に止める）。
    if (getOrderSubtotal() < MIN_ORDER_SUBTOTAL) {
      alert('ご注文は税込2,000円から承っております。お手数ですが商品を追加してください。');
      return;
    }

    // 確認用ページ（隠しページ）では、ここから先（お支払い・注文の送信）へ進まない。
    if (!HP_CONFIG.canSend) {
      const blockedBox = document.getElementById('orderErrorBox');
      if (blockedBox) {
        blockedBox.textContent = HP_CONFIG.blockedMessage;
        blockedBox.style.display = '';
        blockedBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        alert(HP_CONFIG.blockedMessage);
      }
      return;
    }

    orderSubmissionInProgress = true;
    submitBtn.disabled = true;
    submitBtn.textContent = '送信中...';
    showOrderProcessingOverlay();

    // 前回のエラー表示が残っていたら消す
    const orderErrorBox = document.getElementById('orderErrorBox');
    if (orderErrorBox) orderErrorBox.style.display = 'none';

    // クレジットカードの場合：Stripe決済（このページ内で完結）を実行し、
    // 既存の /orders/api/hp-order には送らない（入金確定後、Webhook経由でサーバーが記録する）。
    // select値とpayload両方を見る二重チェック（どちらかがカードなら通常送信には流さない）。
    if (document.getElementById('orderPayment').value === 'credit'
        || orderData.payment === 'クレジットカード') {
      handleCardPaymentSubmit(orderData, submitBtn, orderErrorBox);
      return;
    }

    // 銀行振込・PayPay・代金引換は従来通り（変更なし）
    fetch(HP_CONFIG.apiBase + '/orders/api/hp-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    }).then(r => {
      // サーバーがエラーを返した場合（500等）も「失敗」として扱う
      if (!r.ok) {
        // 400＝サーバーが理由つきで断った（金額が合わない・最低金額など）。
        // その案内文（「ページを再読み込みして…」等）をお客様に見せる。
        return r.json().catch(() => ({})).then(errBody => {
          const httpErr = new Error('HTTP ' + r.status);
          if (r.status === 400 && errBody && errBody.error) {
            httpErr.serverMessage = String(errBody.error);
          }
          throw httpErr;
        });
      }
      return r.json();
    }).then(data => {
      showOrderCompleteScreen(orderData, data);
    }).catch(err => {
      // 送信失敗：成功画面は出さず、正直に伝える。
      // 入力内容は消さずに残し、そのまま再送信できるようにする。
      hideOrderProcessingOverlay();
      submitBtn.disabled = false;
      submitBtn.textContent = '注文内容を確認する';
      if (orderErrorBox) {
        // サーバーの案内文があればそれを、無ければ従来どおりの固定文を出す
        // （前回の案内文が残らないよう、毎回入れ直す）。
        orderErrorBox.textContent = err && err.serverMessage
          ? err.serverMessage + '（ご注文はまだ送信されていません）'
          : '送信できませんでした。お手数ですが、時間をおいて再度お試しいただくか、LINEでご注文ください。';
        orderErrorBox.style.display = '';
        orderErrorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        alert('送信できませんでした。お手数ですが、時間をおいて再度お試しいただくか、LINEでご注文ください。');
      }
    });
  }

  function resetOrderForm() {
    stopShippingConfetti();
    freeShippingCelebrated = false;
    shippingAddressPending = false;
    // 数量・小計をリセット（行は「1品×1入数」で決め打ちなので、入数を戻す作業は無い）
    document.querySelectorAll('.order-product-row').forEach(row => {
      row.querySelector('.order-qty-num').textContent = '0';
      const sub = row.querySelector('.order-subtotal');
      sub.textContent = '-';
      sub.classList.remove('has-value');
    });
    // メニューカードの入数選びも先頭（基準サイズ）に戻す
    document.querySelectorAll('.card .sizes').forEach(wrap => {
      wrap.querySelectorAll('.sz').forEach((b, i) => {
        b.classList.toggle('on', i === 0);
        b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
      });
    });
    // フォームリセット（住所も消えるので送料込みの合計・内訳表示も作り直す）
    document.getElementById('orderForm').reset();
    document.getElementById('orderSubmitBtn').textContent = '注文内容を確認する';
    // 電話番号も消えるので、前のお客様のポイントの枠・残高を残さない
    hidePointUseBox();
    // お支払い方法は最初の選択に戻る。代金引換の出し分け・合計・お支払い欄を作り直す
    updatePaymentOptions();
    updateFloatingCart();
  }

  function closeOrderComplete() {
    setOrderFlow(null);
    document.getElementById('orderCompletePoint').style.display = 'none';
    const orderLineBox = document.getElementById('orderCompleteLineLink');
    if (orderLineBox) orderLineBox.style.display = 'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // PayPay などお支払いの画面へ移った後、ブラウザの「戻る」で帰ってきた時
  // （ページが控えからそのまま戻る＝event.persisted）は、「送信しています…」のまま固まらないよう幕を下ろす。
  window.addEventListener('pageshow', function releaseOrderFlowOnReturn(event) {
    if (event.persisted && isOrderFlowMode('sending')) hideOrderProcessingOverlay();
  });

  // 確認用ページ（隠しページ）だけの案内：カードの入力欄が出ないので、
  // 確認画面は銀行振込に切り替えて見ていただく。掛け替え後（印が無い時）は何も出ない。
  (function showPreviewNotice() {
    if (HP_CONFIG.mode !== 'preview') return;
    const cardBox = document.getElementById('cardPaymentBox');
    if (!cardBox || !cardBox.parentNode) return;
    const note = document.createElement('p');
    note.id = 'previewNotice';
    note.className = 'pv-note';
    note.setAttribute('role', 'note');
    note.textContent = '見本の確認中は、カードの入力欄が出ません。確認画面は、お支払い方法を「銀行振込」に切り替えてご覧ください。';
    cardBox.parentNode.insertBefore(note, cardBox);
  })();

  // LINE連携用の電話番号を保持（残高確認エリアと注文完了画面で使用）
  let lineLinkPhone = '';
  let orderLinkPhone = '';

  function checkPointBalance() {
    const phone = document.getElementById('pointCheckPhone').value.trim();
    if (!phone) { alert('電話番号を入力してください'); return; }
    const resultEl = document.getElementById('pointResult');
    const lineBox = document.getElementById('pointLineLinkBox');
    resultEl.classList.remove('show');
    if (lineBox) lineBox.style.display = 'none';

    fetch(HP_CONFIG.apiBase + '/orders/api/point-check?phone=' + encodeURIComponent(phone))
      .then(r => r.json())
      .then(data => {
        if (data.found) {
          document.getElementById('pointBalanceNum').textContent = data.total_points;
          document.getElementById('pointBalanceLabel').textContent = data.name + '様（会員#' + data.member_id + '）';
          // LINE未連携なら連携ボタンを表示
          if (lineBox && data.line_linked === false) {
            lineLinkPhone = data.phone || phone.replace(/[\s\-\(\)]+/g, '');
            lineBox.style.display = '';
          }
        } else {
          document.getElementById('pointBalanceNum').textContent = '-';
          document.getElementById('pointBalanceLabel').textContent = 'ポイント会員が見つかりませんでした';
        }
        resultEl.classList.add('show');
      })
      .catch(() => {
        document.getElementById('pointBalanceNum').textContent = '-';
        document.getElementById('pointBalanceLabel').textContent = '通信エラーが発生しました';
        resultEl.classList.add('show');
      });
  }

  // クリップボードにLINE連携メッセージをコピーしてLINE友だち追加ページを開く
  function _copyAndOpenLine(phone, btn) {
    const message = '電話 ' + phone;
    const lineUrl = 'https://lin.ee/wbAZif6';
    const showFallback = () => {
      window.prompt('このメッセージをコピーしてLINEで送信してください：', message);
    };
    const openLine = () => {
      // クリップボードコピー成功時のみ案内ダイアログを出す（LINEはユーザー操作で別途開く）
      const original = btn ? btn.textContent : '';
      if (btn) {
        btn.textContent = 'コピーしました';
        btn.disabled = true;
        setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 3000);
      }
      // 少し遅延してLINEを開く（コピー完了を見せるため）
      setTimeout(() => { window.open(lineUrl, '_blank', 'noopener'); }, 400);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(message).then(openLine).catch(showFallback);
    } else {
      showFallback();
      window.open(lineUrl, '_blank', 'noopener');
    }
  }

  function linkLineWithPhone() {
    if (!lineLinkPhone) return;
    _copyAndOpenLine(lineLinkPhone, document.getElementById('pointLineLinkBtn'));
  }

  function linkLineFromOrder() {
    if (!orderLinkPhone) return;
    _copyAndOpenLine(orderLinkPhone, null);
  }

  // URLパラメータ ?link_phone=09012345678 で「ポイント残高確認」を自動展開
  // 催事場のスタッフ画面が表示するQRから飛んできたお客様用
  (function autoLinkFromUrl() {
    const params = new URLSearchParams(location.search);
    const phone = params.get('link_phone');
    if (!phone) return;
    const cleaned = phone.replace(/[\s\-\(\)]+/g, '');
    if (!cleaned) return;
    // DOM準備後に実行
    const run = () => {
      const input = document.getElementById('pointCheckPhone');
      if (!input) return;
      input.value = cleaned;
      input.scrollIntoView({behavior: 'smooth', block: 'center'});
      checkPointBalance();
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run);
    } else {
      setTimeout(run, 100);
    }
  })();

  // Schedule loader
  (function loadSchedule() {
    var container = document.getElementById('scheduleContainer');
    if (!container) return;
    // APIの表示名は、記号も含めて文字として表示する。
    function escapeScheduleText(value) {
      return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
      });
    }
    fetch(HP_CONFIG.apiBase + '/events/api/public/schedule')
      .then(function(r) { return r.json(); })
      .then(function(events) {
        if (!events || events.length === 0) {
          container.innerHTML =
            '<div class="sch-empty">' +
            '<h3>現在予定されている催事はありません</h3>' +
            '<p>最新情報はLINEでお知らせいたします。</p>' +
            '</div>';
          return;
        }
        var arrow = '<svg class="ar" viewBox="0 0 34 10" aria-hidden="true"><path d="M0 8h32l-7-7"/></svg>';
        var html = '<div class="evs">';
        events.forEach(function(ev) {
          var s = ev.start || '';
          var e = ev.end || '';
          var sp = s.split('-');
          var ep = e.split('-');
          var month = sp[1] ? parseInt(sp[1]) + '月' : '';
          var startDay = sp[2] ? parseInt(sp[2]) : '';
          var endDay = ep[2] ? parseInt(ep[2]) : '';
          var range = startDay === endDay ? '' : '〜' + (ep[1] !== sp[1] ? parseInt(ep[1]) + '/' : '') + endDay + '日';
          var lpHref = ev.id ? '/events/' + encodeURIComponent(String(ev.id)) + '/' : '#';
          var tag = ev.id ? 'a' : 'div';
          html += '<' + tag + ' class="ev"' + (ev.id ? ' href="' + lpHref + '"' : '') + '>' +
            '<span class="ev-date">' +
            '<span class="ev-m">' + month + '</span>' +
            '<span class="ev-d">' + startDay + '</span>' +
            (range ? '<span class="ev-r">' + range + '</span>' : '') +
            '</span>' +
            '<span class="ev-body">' +
            '<span class="ev-venue">' + escapeScheduleText(ev.venue || ev.name || '') + '</span>' +
            (ev.area ? '<span class="ev-area">' + escapeScheduleText(ev.area) + '</span>' : '') +
            '</span>' + (ev.id ? arrow : '') + '</' + tag + '>';
        });
        html += '</div>';
        html += '<p class="sch-more"><a href="/events/" class="btn btn-line">催事一覧を見る<svg class="ar" viewBox="0 0 22 10" aria-hidden="true"><path d="M0 8h20l-7-7"/></svg></a></p>';
        container.innerHTML = html;
      })
      .catch(function() {
        container.innerHTML =
          '<div class="sch-empty">' +
          '<h3>催事スケジュール</h3>' +
          '<p>スケジュール情報を取得できませんでした。<br>最新情報はLINEでお知らせいたします。</p>' +
          '</div>';
      });
  })();

  // Contact form handler
  function handleSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const subject = document.getElementById('subject').value;
    const message = document.getElementById('message').value;
    const subjectMap = {
      order: 'ご注文について',
      event: '催事出店について',
      other: 'その他'
    };
    const mailtoLink = `mailto:marhr042425@gmail.com?subject=${encodeURIComponent('【愛華楼】' + subjectMap[subject])}&body=${encodeURIComponent(`お名前: ${name}\nメール: ${email}\n\n${message}`)}`;
    window.location.href = mailtoLink;
    alert('メールアプリが開きます。送信をお願いいたします。');
  }

  // ============================================================
  // 見た目の動き（A案・夜の店先）。お金の計算・送る中身には関わらない。
  // 温め方の開け閉め／スマホのメニュー／ふわっと現れる／提灯の道しるべ／入口の行き先／キーボード操作の気配り／印刷
  // ============================================================
  (function topPageLook() {
    const root = document.documentElement;
    root.classList.add('js');
    const $ = (selector, parent) => (parent || document).querySelector(selector);
    const $$ = (selector, parent) => Array.prototype.slice.call((parent || document).querySelectorAll(selector));
    const calm = prefersReducedMotion();
    const year = $('#copyrightYear');
    if (year) year.textContent = new Date().getFullYear();   // 年は毎年自動更新（JS無効時はHTMLの年のまま）

    // --- 温め方：スマホでは品ごとにたたむ（最初の1つだけ開けておく）。広い画面ではいつも開いたまま ---
    const cooks = $$('details.ck');
    const small = window.matchMedia('(max-width:820px)');
    let printing = false;
    function setCooks() {
      cooks.forEach((c, i) => {
        c.open = (small.matches && !printing) ? (i === 0 || ('#' + c.id) === window.location.hash) : true;
        const s = $('summary', c);
        if (!s) return;
        if (small.matches) s.removeAttribute('tabindex'); else s.setAttribute('tabindex', '-1');
      });
    }
    setCooks();
    if (small.addEventListener) small.addEventListener('change', setCooks);
    cooks.forEach(c => {
      const s = $('summary', c);
      if (s) s.addEventListener('click', e => { if (!small.matches) e.preventDefault(); });
    });

    // --- スマホのメニュー：行き先を選んだら閉じる ---
    const mnav = $('.mnav');
    if (mnav) {
      mnav.addEventListener('click', e => { if (e.target.closest('a')) mnav.open = false; });
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && mnav.open) { mnav.open = false; $('summary', mnav).focus(); }
      });
    }

    // --- ふわっと現れる：開いた時に画面より下にある物だけ ---
    const brand = $('#ftBrand');
    if ('IntersectionObserver' in window && !calm) {
      const io = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) { e.target.classList.remove('wait', 'unlit'); io.unobserve(e.target); }
        });
      }, { rootMargin: '0px 0px -6% 0px' });
      $$('.rv').forEach(e => {
        if (e.getBoundingClientRect().top > window.innerHeight * 0.96) { e.classList.add('wait'); io.observe(e); }
      });
      // 最後の看板：たどり着いた時に灯りが入る
      if (brand && brand.getBoundingClientRect().top > window.innerHeight * 0.96) {
        brand.classList.add('unlit');
        new IntersectionObserver((entries, o) => {
          entries.forEach(e => { if (e.isIntersecting) { brand.classList.remove('unlit'); o.disconnect(); } });
        }, { threshold: 0.55 }).observe(brand);
      }
    }

    // --- 提灯の道しるべ：読み進んだ分だけ下り、章が変わると小さく揺れて、いまの章の番号を灯す ---
    const lamp = $('.lamp'), lampB = $('.lamp>.lamp-b'), lampT = $('.lamp>.lamp-b span');
    const chapters = $$('[data-ch]'), navs = $$('.nav-pc a,.mnav li a'), chNow = $$('.mn-ch');
    let cur = '', tick = false, swayAt = 0, swT = 0;
    function place() {
      tick = false;
      const max = root.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0;
      root.style.setProperty('--p', p.toFixed(4));
      if (!calm && window.scrollY < window.innerHeight * 1.3) {
        root.style.setProperty('--hs', Math.min(window.scrollY / Math.max(window.innerHeight, 1), 1).toFixed(3));
      }
      if (lamp && !calm) {
        lamp.style.setProperty('--lpx', Math.round(14 + p * Math.max(Math.min(window.innerHeight, 1000) - 64 - 52 - 190, 0)) + 'px');
      }
      if (!chapters.length) return;
      let now = chapters[0];
      chapters.forEach(s => { if (s.getBoundingClientRect().top < window.innerHeight * 0.45) now = s; });
      const ch = now.getAttribute('data-ch');
      if (ch === cur) return;
      const first = cur === '';
      cur = ch;
      chNow.forEach(e => { e.textContent = ch; });
      if (lampT) {
        if (calm || first) {
          lampT.textContent = ch;
        } else {
          // 字は消え切ってから入れ替える。続けて章をまたいだ時は、揺れを重ねない
          lampB.classList.add('sw');
          clearTimeout(swT);
          swT = setTimeout(() => { lampT.textContent = cur; lampB.classList.remove('sw'); }, 240);
          const t = Date.now();
          if (t - swayAt > 1700) { swayAt = t; lamp.classList.remove('sway'); void lamp.offsetWidth; lamp.classList.add('sway'); }
        }
      }
      navs.forEach(a => {
        const on = !!now.id && a.getAttribute('href') === '#' + now.id;
        a.classList.toggle('now', on);
        if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      });
    }
    let barTick = false;
    window.addEventListener('scroll', () => {
      if (!tick) { tick = true; requestAnimationFrame(place); }
      // 帯の文字（注文へ進む／注文内容を確認する）は、いまいる場所で変わる
      if (!barTick) { barTick = true; requestAnimationFrame(() => { barTick = false; syncCartBarLabel(); }); }
    }, { passive: true });
    window.addEventListener('resize', place);
    place();

    function cartIsEmpty() {
      return !$$('.order-product-row').some(row => getRowQty(row) > 0);
    }

    document.addEventListener('click', ev => {
      const t = ev.target;
      let b;
      // 入口の行き先：何も選んでいない時、注文フォーム行きの入口（最初の画面の「ご注文はこちら」・上の帯やスマホの案内の「注文する」など）は
      // メニューへ着く。品が入っていれば注文フォームへ。押した時だけ行き先を付け替え、すぐ元に戻す（JSが動かない端末ではリンクのまま）
      if ((b = t.closest('a[href="#orderform"]'))) {
        const empty = cartIsEmpty();
        if (empty) {
          const entry = b;
          entry.setAttribute('href', '#menu');
          setTimeout(() => { entry.setAttribute('href', '#orderform'); }, 0);
        }
        const target = $(empty ? '#menu' : '#orderform');
        let moved = false;
        const onMove = () => { moved = true; };
        ['touchstart', 'wheel', 'keydown'].forEach(n => window.addEventListener(n, onMove, { passive: true, once: true }));
        // なめらかな移動が途中で止まることがある（Safariに近い環境）ので、少し待って、着いていなければ直接移す
        setTimeout(() => {
          if (moved || !target) return;
          const r = target.getBoundingClientRect();
          if (Math.abs(r.top - 80) > 40) target.scrollIntoView({ behavior: 'auto', block: 'start' });
        }, 1300);
        return;
      }
      // 商品 → その品の温め方：スマホではたたんである札を先に開けてから飛ぶ
      if ((b = t.closest('.heat a'))) {
        const k = $(b.getAttribute('href'));
        if (k && k.tagName === 'DETAILS') k.open = true;
      }
    });

    // --- 印刷：たたんである温め方を開き、まだ現れていない物も全部出す ---
    window.addEventListener('beforeprint', () => {
      printing = true;
      cooks.forEach(c => { c.open = true; });
      $$('.wait,.unlit').forEach(e => { e.classList.remove('wait', 'unlit'); });
    });
    window.addEventListener('afterprint', () => { printing = false; setCooks(); });
    const mqp = window.matchMedia('print');
    if (mqp.addEventListener) mqp.addEventListener('change', e => { printing = e.matches; setCooks(); });

    // --- キーボードで動かしている時：いまいる場所が上の帯・下の帯に隠れないように送る ---
    document.addEventListener('keydown', () => { lastInputByKeyboard = true; }, true);
    document.addEventListener('pointerdown', () => { lastInputByKeyboard = false; }, true);
    document.addEventListener('focusin', e => {
      const t = e.target;
      if (!lastInputByKeyboard || !t.getBoundingClientRect || t.closest('.cart,.hd,dialog,.skip')) return;
      const c = $('#floatingCart'), hd = $('.hd');
      if (!c || !hd) return;
      const r = t.getBoundingClientRect();
      const lim = c.classList.contains('off') ? window.innerHeight : c.getBoundingClientRect().top;
      const hb = hd.getBoundingClientRect().bottom;
      if (r.height > lim - hb - 24) return;
      if (r.bottom > lim - 8) window.scrollBy({ top: r.bottom - lim + 16, behavior: 'auto' });
      else if (r.top < hb + 4 && r.top > -window.innerHeight) window.scrollBy({ top: r.top - hb - 16, behavior: 'auto' });
    });

    // ページを離れている間は紙吹雪を止める
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopShippingConfetti(); });
  })();

  // 最初の1回：お支払い方法の最初の選択（クレジットカード・PayPay）に合わせて、
  // 代金引換の出し分け・合計・お支払い欄の案内・カートの見た目を作る。
  updatePaymentOptions();
