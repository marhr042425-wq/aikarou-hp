  // ============================================================
  // 商品価格の自動同期（催事システムDBから fetch）
  // 催事システムで価格を変更すると aikaro.jp が次回読込時に自動反映。
  // 失敗時は HTML ハードコード値をそのまま表示する（フォールバック）。
  // ============================================================
  (function syncHpPrices() {
    const API = 'https://akira042425-1.onrender.com/orders/api/products';
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
      // 1. メニューカード（.menu-card / .featured セクション）
      document.querySelectorAll('.menu-card').forEach(card => {
        const nameEl = card.querySelector('.menu-card-name');
        if (!nameEl) return;
        const p = map[nameEl.textContent.trim()];
        if (!p) return;
        const origEl = card.querySelector('.original-price');
        const hpEl = card.querySelector('.hp-price');
        if (origEl) origEl.textContent = fmt(p.hp_original_price);
        if (hpEl) hpEl.textContent = fmt(p.hp_price);
        // 単位の <small> も更新（hp_unit があれば）
        if (p.hp_unit) {
          const smallEl = card.querySelector('.menu-card-price small, .featured-price small');
          if (smallEl) smallEl.textContent = '/ ' + p.hp_unit + '（税込）';
        }
      });
      // featured セクションは .featured-text 配下に .original-price / .hp-price
      // 「海老焼売」のみ対応（HTML上ハードコード）
      const featuredTitle = document.querySelector('.featured-text h2');
      if (featuredTitle) {
        const p = map[featuredTitle.textContent.trim()];
        if (p) {
          const origEl = document.querySelector('.featured-price .original-price');
          const hpEl = document.querySelector('.featured-price .hp-price');
          if (origEl) origEl.textContent = fmt(p.hp_original_price);
          if (hpEl) hpEl.textContent = fmt(p.hp_price);
          if (p.hp_unit) {
            const smallEl = document.querySelector('.featured-price small');
            if (smallEl) smallEl.textContent = '/ ' + p.hp_unit + '（税込）';
          }
        }
      }

      // 2. 注文セクション（.order-product-row）
      document.querySelectorAll('.order-product-row').forEach(row => {
        // モンゴル茶はボタンごとに割引済みの実額を持つため、DB単価での上書き対象外
        if (row.classList.contains('has-tea-size')) return;
        const nameEl = row.querySelector('.order-product-name');
        if (!nameEl) return;
        // 「肉焼売【生冷凍】」「肉焼売【調理済み冷凍】」も「肉焼売」にマッチ
        const rawName = nameEl.textContent.trim();
        const baseName = rawName.replace(/【[^】]+】/g, '').trim();
        const p = map[rawName] || map[baseName];
        if (!p) return;
        // data-price と data-unit を更新（カート計算用）
        // ※ サイズ選択つきの行（焼き小籠包）では data-price は「基準パック価格」。
        //   8個・12個は基準×倍率でJS側が計算するので、ここでは基準価格だけ更新する。
        row.dataset.price = String(p.hp_price);
        if (p.hp_unit) row.dataset.unit = p.hp_unit;
        const hasSize = row.classList.contains('has-size');
        const priceEl = row.querySelector('.order-product-price');
        if (priceEl && !hasSize) {
          // 「<span class="order-original-price">¥351</span> → ¥333 / 1個（税込）」を再構築
          priceEl.innerHTML =
            '<span class="order-original-price">' + fmt(p.hp_original_price) + '</span>'
            + ' → ' + fmt(p.hp_price) + ' / ' + (p.hp_unit || '') + '（税込）';
        } else if (priceEl && hasSize) {
          // サイズ選択行：選択中サイズに合わせて再描画（基準価格×倍率）
          row.dataset.origPrice = String(p.hp_original_price || '');
          if (typeof renderSizeRowPrice === 'function') renderSizeRowPrice(row);
        }
      });
    }
  })();

  // Mobile nav toggle
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  navToggle.addEventListener('click', () => {
    navLinks.classList.toggle('active');
  });
  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => navLinks.classList.remove('active'));
  });

  // Scroll animations
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.fade-up, .fade-left, .fade-right, .scale-in, .about-badges, .section-header, .featured').forEach(el => observer.observe(el));

  // Header shrink on scroll
  window.addEventListener('scroll', () => {
    document.querySelector('header').classList.toggle('scrolled', window.scrollY > 50);
  });

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
  // その行の「1袋あたりの個数」（基準個数×倍率）。サイズ非対応行は0を返す。
  function getRowPieces(row) {
    const base = parseInt(row.dataset.basePieces);
    if (!base) return 0;
    return base * getRowMultiplier(row);
  }

  // メニューカードのサイズボタンを押したとき（カードの見た目だけ切替）
  function selectSize(btn) {
    const wrap = btn.closest('.menu-size-select');
    if (!wrap) return;
    wrap.querySelectorAll('.menu-size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  // 注文フォーム行のサイズボタンを押したとき（価格・「◯個入」表示・小計を再計算）
  function selectOrderSize(btn) {
    const row = btn.closest('.order-product-row');
    if (!row) return;
    row.querySelectorAll('.order-size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    row.dataset.multiplier = btn.dataset.multiplier;
    renderSizeRowPrice(row);
    // 数量が入っていれば小計を更新
    const numEl = row.querySelector('.order-qty-num');
    const subEl = row.querySelector('.order-subtotal');
    const qty = parseInt(numEl.textContent);
    if (qty > 0) {
      subEl.textContent = '¥' + (getRowPrice(row) * qty).toLocaleString();
      subEl.classList.add('has-value');
    }
    updateTotal();
    updateFloatingCart();
  }

  // サイズ選択行の価格テキスト（「¥1,710 / 8個入（税込）」）を選択中サイズに合わせて再描画
  function renderSizeRowPrice(row) {
    const priceEl = row.querySelector('.order-product-price');
    if (!priceEl) return;
    const pieces = getRowPieces(row);
    const price = getRowPrice(row);
    const origAttr = row.dataset.origPrice;
    let html = '';
    if (origAttr) {
      // 元値も倍率に合わせて表示（基準元値×倍率）
      const orig = parseInt(origAttr) * getRowMultiplier(row);
      html += '<span class="order-original-price">¥' + orig.toLocaleString() + '</span> → ';
    }
    html += '¥' + price.toLocaleString() + ' / ' + pieces + '個入（税込）';
    priceEl.innerHTML = html;
  }

  // ============================================================
  // モンゴル茶 専用サイズ選択（1袋/2袋/3袋）
  // 焼売の倍率方式とは別物。各ボタンに「割引済みの実額」を直接持たせる。
  // 注文行は data-multiplier を持たないので getRowPrice() は data-price×1＝実額。
  // 1袋30個入なので 2袋=計60個・3袋=計90個。
  // ============================================================
  const TEA_PIECES_PER_BAG = 30;   // 1袋の個数
  const TEA_BASE_PRICE = 4000;     // 1袋あたりの基準価格（割引率計算の分母）

  // メニューカードのサイズボタン（見た目だけ切替）
  function selectTeaSize(btn) {
    const wrap = btn.closest('.menu-size-select');
    if (!wrap) return;
    wrap.querySelectorAll('.menu-size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  // 注文行のサイズボタン（実額を直接 data-price に入れて再計算）
  function selectOrderTeaSize(btn) {
    const row = btn.closest('.order-product-row');
    if (!row) return;
    row.querySelectorAll('.order-size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    row.dataset.price = btn.dataset.teaPrice;   // 割引済みの実額
    row.dataset.teaBags = btn.dataset.teaBags;
    renderTeaRowPrice(row);
    const numEl = row.querySelector('.order-qty-num');
    const subEl = row.querySelector('.order-subtotal');
    const qty = parseInt(numEl.textContent);
    if (qty > 0) {
      subEl.textContent = '¥' + (getRowPrice(row) * qty).toLocaleString();
      subEl.classList.add('has-value');
    }
    updateTotal();
    updateFloatingCart();
  }

  // モンゴル茶 注文行の価格テキスト＋「1袋あたり¥○○（○%お得）」を再描画
  function renderTeaRowPrice(row) {
    const priceEl = row.querySelector('.order-product-price');
    const bags = parseInt(row.dataset.teaBags) || 1;
    const price = parseInt(row.dataset.price);
    const totalPieces = bags * TEA_PIECES_PER_BAG;
    if (priceEl) {
      const unitText = bags > 1
        ? bags + '袋（計' + totalPieces + '個）'
        : '1袋30個入';
      priceEl.innerHTML = '¥' + price.toLocaleString() + ' / ' + unitText + '（税込）';
    }
    const hintEl = row.querySelector('.order-size-hint');
    if (hintEl) {
      if (bags > 1) {
        const perBag = price / bags;                       // 1袋あたりの実額
        const offPct = Math.round((1 - perBag / TEA_BASE_PRICE) * 100);
        hintEl.innerHTML = '<span>1袋あたり¥' + perBag.toLocaleString()
          + '（' + offPct + '%お得）</span>';
        hintEl.style.display = '';
      } else {
        hintEl.innerHTML = '';
        hintEl.style.display = 'none';
      }
    }
  }

  // メニューカードからモンゴル茶をカートに追加（選択中の袋数を注文行へ反映）
  function addTeaToOrder() {
    const wrap = document.querySelector('.menu-size-select[data-product="モンゴル茶"]');
    let bags = '1';
    if (wrap) {
      const active = wrap.querySelector('.menu-size-btn.active');
      if (active) bags = active.dataset.teaBags;
    }
    const row = document.querySelector('.order-product-row.has-tea-size');
    if (!row) return;
    // 選んだ袋数に対応する注文行ボタンを active に切り替えて価格を合わせる
    const sizeBtn = row.querySelector('.order-size-btn[data-tea-bags="' + bags + '"]');
    if (sizeBtn) {
      row.querySelectorAll('.order-size-btn').forEach(b => b.classList.remove('active'));
      sizeBtn.classList.add('active');
      row.dataset.price = sizeBtn.dataset.teaPrice;
      row.dataset.teaBags = bags;
      renderTeaRowPrice(row);
    }
    const numEl = row.querySelector('.order-qty-num');
    const subEl = row.querySelector('.order-subtotal');
    const price = getRowPrice(row);
    const qty = parseInt(numEl.textContent) + 1;
    numEl.textContent = qty;
    subEl.textContent = '¥' + (price * qty).toLocaleString();
    subEl.classList.add('has-value');
    updateTotal();
    // 追加ボタンを緑にフラッシュ
    document.querySelectorAll('.menu-add-btn').forEach(btn => {
      if (btn.onclick && btn.onclick.toString().includes('addTeaToOrder')) {
        btn.textContent = '✓ 追加しました';
        btn.classList.add('added');
        setTimeout(() => {
          btn.textContent = '＋ カートに追加';
          btn.classList.remove('added');
        }, 1500);
      }
    });
    row.style.boxShadow = '0 0 16px rgba(201,168,76,0.5)';
    setTimeout(() => { row.style.boxShadow = ''; }, 1500);
    updateFloatingCart();
  }

  // Add to order from menu card
  function addToOrder(productName) {
    // メニューカードでサイズが選ばれていれば、対応する注文行のサイズも合わせる
    // 焼き小籠包は data-product がフル名で一致。焼売系は「肉焼売【生冷凍】」など
    // 種類付きなので、フル名で見つからなければ種類を外した基準名でも探す（カード1つに
    // サイズ選択1つ・追加ボタン2つの2段構成に対応）。
    let sizeWrap = document.querySelector('.menu-size-select[data-product="' + productName + '"]');
    if (!sizeWrap) {
      const baseProduct = productName.replace(/【[^】]+】/g, '').trim();
      sizeWrap = document.querySelector('.menu-size-select[data-product="' + baseProduct + '"]');
    }
    let selectedMultiplier = null;
    if (sizeWrap) {
      const active = sizeWrap.querySelector('.menu-size-btn.active');
      if (active) selectedMultiplier = active.dataset.multiplier;
    }
    const rows = document.querySelectorAll('.order-product-row');
    for (const row of rows) {
      const name = row.querySelector('.order-product-name').textContent;
      if (name === productName) {
        // サイズ選択商品なら、カードで選んだサイズを注文行に反映
        if (selectedMultiplier && row.classList.contains('has-size')) {
          const sizeBtn = row.querySelector('.order-size-btn[data-multiplier="' + selectedMultiplier + '"]');
          if (sizeBtn) {
            row.querySelectorAll('.order-size-btn').forEach(b => b.classList.remove('active'));
            sizeBtn.classList.add('active');
            row.dataset.multiplier = selectedMultiplier;
            renderSizeRowPrice(row);
          }
        }
        const numEl = row.querySelector('.order-qty-num');
        const subEl = row.querySelector('.order-subtotal');
        const price = getRowPrice(row);
        let qty = parseInt(numEl.textContent) + 1;
        numEl.textContent = qty;
        subEl.textContent = '¥' + (price * qty).toLocaleString();
        subEl.classList.add('has-value');
        updateTotal();
        // Flash the button green
        const btns = document.querySelectorAll('.menu-add-btn');
        btns.forEach(btn => {
          if (btn.onclick.toString().includes(productName)) {
            btn.textContent = '✓ 追加しました';
            btn.classList.add('added');
            setTimeout(() => {
              btn.textContent = '＋ カートに追加';
              btn.classList.remove('added');
            }, 1500);
          }
        });
        // Highlight the row briefly
        row.style.boxShadow = '0 0 16px rgba(201,168,76,0.5)';
        setTimeout(() => { row.style.boxShadow = ''; }, 1500);
        // Update floating cart (don't scroll)
        updateFloatingCart();
        break;
      }
    }
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
    const cart = document.getElementById('floatingCart');
    if (totalQty > 0) {
      cart.classList.add('show');
      // Float buttons up
      document.querySelector('.line-float').style.bottom = '80px';
      document.querySelector('.ig-float').style.bottom = '166px';
    } else {
      cart.classList.remove('show');
      document.querySelector('.line-float').style.bottom = '24px';
      document.querySelector('.ig-float').style.bottom = '110px';
    }
  }

  // Order form logic
  function changeQty(btn, delta) {
    const row = btn.closest('.order-product-row');
    const numEl = row.querySelector('.order-qty-num');
    const subEl = row.querySelector('.order-subtotal');
    const price = getRowPrice(row);
    let qty = parseInt(numEl.textContent) + delta;
    if (qty < 0) qty = 0;
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
    fetch('https://akira042425-1.onrender.com/orders/api/point-check?phone=' + encodeURIComponent(phone))
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
      textEl.style.color = '#aaa';
      return;
    }

    const applied = resolveUsablePoints(useAmount);
    if (applied >= MIN_POINT_USE) {
      infoEl.style.display = '';
      // 割引額だけでなく「実際にお支払いいただく金額」まで見せる
      // （2026-07-26: 合計欄は割引前のままなので、ここで必ず明示する）
      textEl.innerHTML = '−¥' + applied.toLocaleString() + ' ポイント割引適用'
        + '<br>お支払い金額: ¥' + Math.max(total - applied, 0).toLocaleString();
      textEl.style.color = '#E84040';
    } else {
      infoEl.style.display = 'none';
    }
  }

  // 郵便番号自動検索
  const zipInput = document.getElementById('orderZip');
  const addressInput = document.getElementById('orderAddress');
  zipInput.addEventListener('input', function() {
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
    } else {
      codOption.style.display = 'none';
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
  const STRIPE_PUBLISHABLE_KEY = 'pk_live_51Tr9DeKcjgjrrEc7m6bPcA1qAeUezMYcy4y54Q4OlA1kWoZYq39DUf1VnjrXHyxJoph09LLUGKkjn3lbkl0perOu005b6JT774';
  const PAYMENT_API_BASE = 'https://akira042425-1.onrender.com/payment';
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

  function getStripe() {
    if (!stripeInstance && window.Stripe) {
      stripeInstance = window.Stripe(STRIPE_PUBLISHABLE_KEY);
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
    const el = document.getElementById('cardChargeAmount');
    if (!el) return;
    let html = 'このカードへのご請求額: ¥' + Number(amount).toLocaleString();
    if (pointsUsed > 0) {
      html += '<br><span style="font-weight:400;font-size:0.85rem;color:#ccc;">'
        + '（ご注文合計 ¥' + Number(orderTotal).toLocaleString()
        + ' − ポイント ' + Number(pointsUsed).toLocaleString() + 'pt）</span>';
    }
    el.innerHTML = html;
    el.style.display = '';
  }

  function hideCardChargeAmount() {
    const el = document.getElementById('cardChargeAmount');
    if (el) { el.style.display = 'none'; el.innerHTML = ''; }
  }

  function unmountCardPaymentElement() {
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
    document.querySelectorAll('.order-product-row').forEach(row => {
      const qty = parseInt(row.querySelector('.order-qty-num').textContent);
      if (qty > 0) {
        const name = row.querySelector('.order-product-name').textContent;
        const price = getRowPrice(row);
        const subtotal = '¥' + (price * qty).toLocaleString();
        if (row.classList.contains('has-tea-size')) {
          const bags = parseInt(row.dataset.teaBags) || 1;
          const pieces = bags * TEA_PIECES_PER_BAG;
          const setLabel = name + ' ' + bags + '袋セット（計' + pieces + '個）';
          if (qty > 1) {
            items.push(setLabel + ' × ' + qty + ' ' + subtotal);
          } else {
            items.push(setLabel + ' ' + subtotal);
          }
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
    return { items, total, name, phone, email, address, delivery, payment, date, note, member_id, use_points: validUsePoints };
  }

  function showOrderCompleteScreen(orderData, respData) {
    hideOrderProcessingOverlay();
    const summary = document.getElementById('orderCompleteSummary');
    let pointLine = '';
    if (orderData.use_points > 0) {
      pointLine = '<br><span style="color:#E84040;font-weight:700;">ポイント利用: −¥' + orderData.use_points.toLocaleString() + '</span>';
      const totalNum = parseInt(orderData.total.replace(/[^\d]/g, '')) || 0;
      const afterPoint = totalNum - orderData.use_points;
      pointLine += '<br><strong>お支払い金額: ¥' + afterPoint.toLocaleString() + '</strong>';
    }
    summary.innerHTML = '<strong>注文内容</strong><br>' + orderData.items.join('<br>') +
      '<br><br><strong>合計: ' + orderData.total + '</strong>' + pointLine +
      '<br><br><strong>お届け先</strong><br>' + orderData.name + '様<br>' + orderData.address +
      '<br><br><strong>配送:</strong> ' + orderData.delivery +
      '<br><strong>お支払い:</strong> ' + orderData.payment;

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

    document.getElementById('orderCompleteOverlay').classList.add('show');
    resetOrderForm();
  }

  function showOrderCompletePending(orderData) {
    // オンライン決済（カード・PayPay）はWebhook確定を待つため、断定的な完了ではなく
    // 「確認中」の趣旨で表示する（実際の入金確定はサーバー側Webhookで行う）。
    hideOrderProcessingOverlay();
    const summary = document.getElementById('orderCompleteSummary');
    // 実際に請求された金額（＝合計 − ポイント）を明示する
    let pendingPointLine = '';
    if (orderData.use_points > 0) {
      const totalNum = parseInt(String(orderData.total).replace(/[^\d]/g, '')) || 0;
      pendingPointLine = '<br><span style="color:#E84040;font-weight:700;">ポイント利用: −¥'
        + orderData.use_points.toLocaleString() + '</span>'
        + '<br><strong>ご請求額: ¥'
        + Math.max(totalNum - orderData.use_points, 0).toLocaleString() + '</strong>';
    }
    summary.innerHTML = '<strong>ご注文内容</strong><br>' + orderData.items.join('<br>') +
      '<br><br><strong>合計: ' + orderData.total + '</strong>' + pendingPointLine +
      '<br><br><strong>お届け先</strong><br>' + orderData.name + '様<br>' + orderData.address +
      '<br><br><strong>配送:</strong> ' + orderData.delivery +
      '<br><strong>お支払い:</strong> ' + orderData.payment +
      '<br><br><span style="color:#aaa;font-size:0.85rem;">決済を確認しています。確認が取れ次第、メールでご連絡いたします。</span>';
    document.getElementById('orderCompleteOverlay').classList.add('show');
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
      submitBtn.textContent = '注文内容を送信する';
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
    // theme: 'night' … サイトの黒背景でもラベル・入力欄が読めるダーク配色
    stripeElements = stripe.elements({
      clientSecret: currentClientSecret,
      locale: 'ja',
      appearance: {
        theme: 'night',
        variables: {
          colorPrimary: '#d4a843',
          borderRadius: '6px',
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
    document.getElementById('orderSubmitBtn').disabled = subtotal < MIN_ORDER_SUBTOTAL;

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
      shippingEl.textContent = subLabel + ' ＋ 🎉 送料無料（¥8,000以上）';
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
  }

  // 送信中オーバーレイの表示・非表示（ボタン文字の変化だけでは気付きにくいため、
  // 画面全体を覆って「送信して処理が進んでいる」ことをハッキリ伝える）。
  function showOrderProcessingOverlay() {
    const el = document.getElementById('orderProcessingOverlay');
    if (el) el.classList.add('show');
  }
  function hideOrderProcessingOverlay() {
    const el = document.getElementById('orderProcessingOverlay');
    if (el) el.classList.remove('show');
  }

  function handleOrderSubmit(e) {
    e.preventDefault();
    const submitBtn = document.getElementById('orderSubmitBtn');

    // 最低注文金額（税込¥2,000）未満は受け付けない
    // （ボタンはupdateTotalで無効化済みだが、念のためここでも二重に止める）。
    if (getOrderSubtotal() < MIN_ORDER_SUBTOTAL) {
      alert('ご注文は税込2,000円から承っております。お手数ですが商品を追加してください。');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '送信中...';
    showOrderProcessingOverlay();

    // 前回のエラー表示が残っていたら消す
    const orderErrorBox = document.getElementById('orderErrorBox');
    if (orderErrorBox) orderErrorBox.style.display = 'none';

    const orderData = buildOrderPayload();

    // クレジットカードの場合：Stripe決済（このページ内で完結）を実行し、
    // 既存の /orders/api/hp-order には送らない（入金確定後、Webhook経由でサーバーが記録する）。
    // select値とpayload両方を見る二重チェック（どちらかがカードなら通常送信には流さない）。
    if (document.getElementById('orderPayment').value === 'credit'
        || orderData.payment === 'クレジットカード') {
      handleCardPaymentSubmit(orderData, submitBtn, orderErrorBox);
      return;
    }

    // 銀行振込・PayPay・代金引換は従来通り（変更なし）
    fetch('https://akira042425-1.onrender.com/orders/api/hp-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    }).then(r => {
      // サーバーがエラーを返した場合（500等）も「失敗」として扱う
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(data => {
      showOrderCompleteScreen(orderData, data);
    }).catch(err => {
      // 送信失敗：成功画面は出さず、正直に伝える。
      // 入力内容は消さずに残し、そのまま再送信できるようにする。
      hideOrderProcessingOverlay();
      submitBtn.disabled = false;
      submitBtn.textContent = '注文内容を送信する';
      if (orderErrorBox) {
        orderErrorBox.style.display = '';
        orderErrorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        alert('送信できませんでした。お手数ですが、時間をおいて再度お試しいただくか、LINEでご注文ください。');
      }
    });
  }

  function resetOrderForm() {
    // 数量・小計をリセット
    document.querySelectorAll('.order-product-row').forEach(row => {
      row.querySelector('.order-qty-num').textContent = '0';
      const sub = row.querySelector('.order-subtotal');
      sub.textContent = '-';
      sub.classList.remove('has-value');
      // サイズ選択行は基準サイズ（×1）に戻す
      if (row.classList.contains('has-size')) {
        row.dataset.multiplier = '1';
        const btns = row.querySelectorAll('.order-size-btn');
        btns.forEach(b => b.classList.toggle('active', b.dataset.multiplier === '1'));
        renderSizeRowPrice(row);
      }
      // モンゴル茶は1袋に戻す
      if (row.classList.contains('has-tea-size')) {
        row.dataset.teaBags = '1';
        row.dataset.price = '4000';
        const btns = row.querySelectorAll('.order-size-btn');
        btns.forEach(b => b.classList.toggle('active', b.dataset.teaBags === '1'));
        renderTeaRowPrice(row);
      }
    });
    // メニューカードのサイズ選択も基準サイズに戻す
    document.querySelectorAll('.menu-size-select').forEach(wrap => {
      const btns = wrap.querySelectorAll('.menu-size-btn');
      // モンゴル茶カードは data-tea-bags、それ以外は data-multiplier が「1」のボタンを基準に
      const isTea = wrap.dataset.product === 'モンゴル茶';
      btns.forEach(b => b.classList.toggle('active',
        isTea ? b.dataset.teaBags === '1' : b.dataset.multiplier === '1'));
    });
    // フォームリセット（住所も消えるので送料込みの合計・内訳表示も作り直す）
    document.getElementById('orderForm').reset();
    document.getElementById('orderSubmitBtn').textContent = '注文内容を送信する';
    updateTotal();
    updateFloatingCart();
  }

  function closeOrderComplete() {
    document.getElementById('orderCompleteOverlay').classList.remove('show');
    document.getElementById('orderCompletePoint').style.display = 'none';
    const orderLineBox = document.getElementById('orderCompleteLineLink');
    if (orderLineBox) orderLineBox.style.display = 'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

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

    fetch('https://akira042425-1.onrender.com/orders/api/point-check?phone=' + encodeURIComponent(phone))
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
        btn.textContent = '✓ コピーしました';
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
    fetch('https://akira042425-1.onrender.com/events/api/public/schedule')
      .then(function(r) { return r.json(); })
      .then(function(events) {
        if (!events || events.length === 0) {
          container.innerHTML =
            '<div class="schedule-empty">' +
            '<h3>現在予定されている催事はありません</h3>' +
            '<p>最新情報はLINEでお知らせいたします。</p>' +
            '</div>';
          return;
        }
        var html = '<div class="schedule-list">';
        events.forEach(function(ev) {
          var s = ev.start || '';
          var e = ev.end || '';
          var sp = s.split('-');
          var ep = e.split('-');
          var month = sp[1] ? parseInt(sp[1]) + '月' : '';
          var startDay = sp[2] ? parseInt(sp[2]) : '';
          var endDay = ep[2] ? parseInt(ep[2]) : '';
          var range = startDay === endDay ? '' : '〜' + (ep[1] !== sp[1] ? parseInt(ep[1]) + '/' : '') + endDay + '日';
          var lpHref = ev.id ? '/events/' + ev.id + '/' : '#';
          var tag = ev.id ? 'a' : 'div';
          html += '<' + tag + ' class="schedule-card"' + (ev.id ? ' href="' + lpHref + '"' : '') + '>' +
            '<div class="schedule-card-date">' +
            '<span class="schedule-card-month">' + month + '</span>' +
            '<span class="schedule-card-day">' + startDay + '</span>' +
            (range ? '<span class="schedule-card-range">' + range + '</span>' : '') +
            '</div>' +
            '<div class="schedule-card-body">' +
            '<div class="schedule-card-venue">' + (ev.venue || ev.name || '') + '</div>' +
            (ev.area ? '<div class="schedule-card-area">' + ev.area + '</div>' : '') +
            '</div></' + tag + '>';
        });
        html += '</div>';
        html += '<div style="text-align:center; margin-top:1.5rem;"><a href="/events/" style="display:inline-block; padding:0.6rem 1.4rem; border:1px solid #ffd700; color:#ffd700; border-radius:999px; text-decoration:none; font-size:0.9rem;">催事一覧を見る →</a></div>';
        container.innerHTML = html;
      })
      .catch(function() {
        container.innerHTML =
          '<div class="schedule-empty">' +
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
