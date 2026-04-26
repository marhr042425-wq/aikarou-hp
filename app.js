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

  // Add to order from menu card
  function addToOrder(productName) {
    const rows = document.querySelectorAll('.order-product-row');
    for (const row of rows) {
      const name = row.querySelector('.order-product-name').textContent;
      if (name === productName) {
        const numEl = row.querySelector('.order-qty-num');
        const subEl = row.querySelector('.order-subtotal');
        const price = parseInt(row.dataset.price);
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
      const price = parseInt(row.dataset.price);
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
    const price = parseInt(row.dataset.price);
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

  function useAllPoints() {
    const totalText = document.getElementById('orderTotal').textContent;
    const total = parseInt(totalText.replace(/[^\d]/g, '')) || 0;
    const maxUse = Math.min(customerPoints, total);
    document.getElementById('pointUseAmount').value = maxUse >= 50 ? maxUse : 0;
    applyPointDiscount();
  }

  function applyPointDiscount() {
    const useAmount = parseInt(document.getElementById('pointUseAmount').value) || 0;
    const infoEl = document.getElementById('pointDiscountInfo');
    const textEl = document.getElementById('pointDiscountText');

    // バリデーション
    if (useAmount > customerPoints) {
      document.getElementById('pointUseAmount').value = customerPoints;
      applyPointDiscount();
      return;
    }

    if (useAmount > 0 && useAmount < 50) {
      infoEl.style.display = '';
      textEl.textContent = '※ 50pt以上から利用可能です';
      textEl.style.color = '#aaa';
      return;
    }

    if (useAmount >= 50) {
      infoEl.style.display = '';
      textEl.textContent = '−¥' + useAmount.toLocaleString() + ' ポイント割引適用';
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
    if (delivery === 'yamato') {
      codOption.style.display = '';
    } else {
      codOption.style.display = 'none';
      if (paymentSelect.value === 'cod') {
        paymentSelect.value = 'bank';
      }
    }
  }

  function updateTotal() {
    let total = 0;
    document.querySelectorAll('.order-product-row').forEach(row => {
      const qty = parseInt(row.querySelector('.order-qty-num').textContent);
      const price = parseInt(row.dataset.price);
      total += price * qty;
    });
    document.getElementById('orderTotal').textContent = '¥' + total.toLocaleString();
    document.getElementById('orderSubmitBtn').disabled = total === 0;
    const shippingEl = document.getElementById('orderShipping');
    if (total >= 5000) {
      shippingEl.textContent = '🎉 送料無料';
      shippingEl.classList.add('free');
    } else if (total > 0) {
      const remain = 5000 - total;
      shippingEl.textContent = 'あと¥' + remain.toLocaleString() + 'で送料無料';
      shippingEl.classList.remove('free');
    } else {
      shippingEl.textContent = '※ 税込¥5,000以上で送料無料';
      shippingEl.classList.remove('free');
    }
  }

  function handleOrderSubmit(e) {
    e.preventDefault();
    const submitBtn = document.getElementById('orderSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = '送信中...';

    const items = [];
    document.querySelectorAll('.order-product-row').forEach(row => {
      const qty = parseInt(row.querySelector('.order-qty-num').textContent);
      if (qty > 0) {
        const name = row.querySelector('.order-product-name').textContent;
        const unit = row.dataset.unit;
        const price = parseInt(row.dataset.price);
        items.push(name + ' × ' + qty + '（' + unit + '） ¥' + (price * qty).toLocaleString());
      }
    });
    const total = document.getElementById('orderTotal').textContent;
    const name = document.getElementById('orderName').value;
    const phone = document.getElementById('orderPhone').value;
    const email = document.getElementById('orderEmail').value;
    const zip = document.getElementById('orderZip').value;
    const banchi = document.getElementById('orderBanchi').value;
    const building = document.getElementById('orderBuilding').value;
    const address = '〒' + zip + ' ' + document.getElementById('orderAddress').value + banchi + (building ? ' ' + building : '');
    const deliveryMap = { sagawa: '佐川急便（冷凍便）', yamato: 'クロネコヤマト（冷凍便）' };
    const delivery = deliveryMap[document.getElementById('orderDelivery').value];
    const paymentMap = { bank: '銀行振込', credit: 'クレジットカード', paypay: 'PayPay', cod: '代金引換（クロネコヤマト）' };
    const payment = paymentMap[document.getElementById('orderPayment').value];
    const date = document.getElementById('orderDate').value || '指定なし';
    const note = document.getElementById('orderNote').value || 'なし';
    const member_id = document.getElementById('orderMemberId').value.trim();
    const usePoints = parseInt(document.getElementById('pointUseAmount').value) || 0;
    const validUsePoints = (usePoints >= 50 && usePoints <= customerPoints) ? usePoints : 0;

    // Render（催事管理システム）へ送信
    fetch('https://akira042425-1.onrender.com/orders/api/hp-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, total, name, phone, email, address, delivery, payment, date, note, member_id, use_points: validUsePoints })
    }).then(r => r.json()).then(data => {
      // 注文完了画面を表示
      const summary = document.getElementById('orderCompleteSummary');
      let pointLine = '';
      if (validUsePoints > 0) {
        pointLine = '<br><span style="color:#E84040;font-weight:700;">ポイント利用: −¥' + validUsePoints.toLocaleString() + '</span>';
        const totalNum = parseInt(total.replace(/[^\d]/g, '')) || 0;
        const afterPoint = totalNum - validUsePoints;
        pointLine += '<br><strong>お支払い金額: ¥' + afterPoint.toLocaleString() + '</strong>';
      }
      summary.innerHTML = '<strong>注文内容</strong><br>' + items.join('<br>') +
        '<br><br><strong>合計: ' + total + '</strong>' + pointLine +
        '<br><br><strong>お届け先</strong><br>' + name + '様<br>' + address +
        '<br><br><strong>配送:</strong> ' + delivery +
        '<br><strong>お支払い:</strong> ' + payment;

      // ポイント情報
      if (data.point_info) {
        const ptMatch = data.point_info.match(/\+(\d+)pt.*残高:\s*(\d+)pt.*会員#(\d+)/);
        if (ptMatch) {
          document.getElementById('orderPointEarned').textContent = ptMatch[1];
          document.getElementById('orderPointBalance').textContent = '残高: ' + ptMatch[2] + 'pt（会員番号: #' + ptMatch[3] + '）';
          document.getElementById('orderCompletePoint').style.display = '';
        }
      }

      // LINE未連携なら連携ボタンを表示
      const orderLineBox = document.getElementById('orderCompleteLineLink');
      if (orderLineBox && data.line_linked === false) {
        orderLinkPhone = data.phone || phone.replace(/[\s\-\(\)]+/g, '');
        orderLineBox.style.display = '';
      } else if (orderLineBox) {
        orderLineBox.style.display = 'none';
      }

      document.getElementById('orderCompleteOverlay').classList.add('show');

      // カートリセット
      resetOrderForm();

    }).catch(err => {
      // 通信エラー時もフォールバック表示
      document.getElementById('orderCompleteSummary').innerHTML =
        '<strong>注文内容</strong><br>' + items.join('<br>') + '<br><br><strong>合計: ' + total + '</strong>' +
        '<br><br><span style="color:#E84040;">※ サーバーとの通信に問題がありましたが、注文内容はメールでもお送りします。</span>';
      document.getElementById('orderCompleteOverlay').classList.add('show');
      resetOrderForm();
    });
  }

  function resetOrderForm() {
    // 数量・小計をリセット
    document.querySelectorAll('.order-product-row').forEach(row => {
      row.querySelector('.order-qty-num').textContent = '0';
      const sub = row.querySelector('.order-subtotal');
      sub.textContent = '-';
      sub.classList.remove('has-value');
    });
    // フォームリセット
    document.getElementById('orderForm').reset();
    document.getElementById('orderTotal').textContent = '¥0';
    document.getElementById('orderSubmitBtn').disabled = true;
    document.getElementById('orderSubmitBtn').textContent = '注文内容を送信する';
    document.getElementById('orderShipping').textContent = '※ 税込¥5,000以上で送料無料';
    document.getElementById('orderShipping').classList.remove('free');
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
          html += '<div class="schedule-card">' +
            '<div class="schedule-card-date">' +
            '<span class="schedule-card-month">' + month + '</span>' +
            '<span class="schedule-card-day">' + startDay + '</span>' +
            (range ? '<span class="schedule-card-range">' + range + '</span>' : '') +
            '</div>' +
            '<div class="schedule-card-body">' +
            '<div class="schedule-card-venue">' + (ev.venue || ev.name || '') + '</div>' +
            (ev.area ? '<div class="schedule-card-area">' + ev.area + '</div>' : '') +
            '</div></div>';
        });
        html += '</div>';
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
