#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""新しいトップページ（index-a.html・top.js）を、手元で安全に試すための確認用サーバー。

本番（催事アプリ・本番の Stripe）へは絶対につながない：
  ・top.js は aikaro.jp 以外で開かれた時、催事アプリの受け口を「いま開いている場所」（＝このサーバー）に見に行く。
  ・このサーバーは、受け口の「代役」を自分で演じる（値段・ポイント残高・催事スケジュール・注文の受付は、決まった見本の答え）。
    催事アプリのデータ（手元のものも本番のものも）には一切さわらない。
  ・カードの入力欄だけは本物の Stripe の「テスト用の場所」に作る。使う鍵は、鍵の紙（.env）にある
    テスト用の鍵（sk_test_／pk_test_ で始まる物）だけ。本番用の鍵（sk_live_／pk_live_）が書いてあったら、
    何もせずに止まる（お金は動かない）。
  ・鍵はコマンドに打たない。鍵の紙の場所だけを --env-file（または環境変数 AIKARO_ENV_FILE）で渡す。
    鍵を渡さなければ、カードの入力欄は出ない（それ以外は全部試せる）。

使い方（HPの置き場の根で）:
  python3 scripts/local_preview_server.py --port 8985 --env-file <鍵の紙の場所>
  → http://127.0.0.1:8985/index-a.html を開く。終わったら Ctrl+C で止める。

見本の答え:
  ・ポイント照会：電話番号 090-0000-0000 →「確認 太郎様・残高120pt・会員0001・LINE未連携」。ほかの番号は「見つからない」。
  ・注文の受付（銀行振込・代金引換）：受け付けたことにして、ポイント付与の見本を返す。どこにも保存しない・メールも送らない。
  ・?fail=1 を付けて開いた時の代役の失敗などは作っていない（必要になったら足す）。
"""
import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE = {'pk': '', 'sk': '', 'log': []}


def read_env_keys(path):
    """鍵の紙から Stripe のテスト用の鍵だけを読む。本番用の鍵だったら止まる。値は画面に出さない。"""
    found = {}
    with open(path, encoding='utf-8') as f:
        for line in f:
            m = re.match(r'^\s*(STRIPE_PUBLISHABLE_KEY|STRIPE_SECRET_KEY)\s*=\s*["\']?([^"\'\s#]+)', line)
            if m:
                found[m.group(1)] = m.group(2)
    pk, sk = found.get('STRIPE_PUBLISHABLE_KEY', ''), found.get('STRIPE_SECRET_KEY', '')
    if not pk.startswith('pk_test_') or not sk.startswith('sk_test_'):
        sys.exit('止めました：鍵の紙の Stripe の鍵がテスト用（pk_test_／sk_test_）ではありません。本番用の鍵では動かしません。')
    return pk, sk


def sample_products():
    """index-a.html の注文フォームの行から、値段の見本を作る（催事アプリの /orders/api/products の代役）。"""
    html = open(os.path.join(ROOT, 'index-a.html'), encoding='utf-8').read()
    products, seen = [], set()
    for m in re.finditer(r'<div class="order-product-row pk has-size" data-product-name="([^"]+)" data-price="(\d+)" data-unit="([^"]+)"'
                         r' data-base-pieces="\d+" data-multiplier="1" data-orig-price="(\d+)"', html):
        name = re.sub(r'【[^】]+】', '', m.group(1))
        if name in seen:
            continue
        seen.add(name)
        products.append({'name': name, 'hp_display_name': name, 'hp_price': int(m.group(2)),
                         'hp_original_price': int(m.group(4)), 'hp_unit': m.group(3)})
    return products


def stripe_create_intent(amount):
    """Stripe のテスト用の場所に、支払いの下書き（PaymentIntent）を1つ作る。お金は動かない。"""
    assert STATE['sk'].startswith('sk_test_')
    body = urllib.parse.urlencode({
        'amount': str(int(amount)), 'currency': 'jpy',
        'automatic_payment_methods[enabled]': 'true',
        'description': 'local preview (test mode)',
    }).encode()
    req = urllib.request.Request('https://api.stripe.com/v1/payment_intents', data=body, method='POST',
                                 headers={'Authorization': 'Bearer ' + STATE['sk']})
    with urllib.request.urlopen(req, timeout=20) as res:
        return json.loads(res.read().decode())


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, fmt, *args):
        sys.stderr.write('[確認用サーバー] ' + (fmt % args) + '\n')

    def send_json(self, data, status=200):
        raw = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(raw)

    def end_headers(self):
        # 直した物がすぐ見えるように、手元では控えを持たせない（2026-07-10：古い控えを配っていた事故）
        if not self.path.startswith('/__local') and '/api/' not in self.path:
            self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(url.query)
        if url.path == '/__local/config':
            return self.send_json({'stripe_publishable_key': STATE['pk'], 'mode': 'local-stub'})
        if url.path == '/__local/log':
            return self.send_json(STATE['log'])
        if url.path == '/orders/api/products':
            return self.send_json({'products': sample_products()})
        if url.path == '/orders/api/point-check':
            phone = re.sub(r'[\s\-()]', '', (query.get('phone') or [''])[0])
            if phone == '09000000000':
                return self.send_json({'found': True, 'total_points': 120, 'name': '確認 太郎', 'member_id': '0001',
                                       'line_linked': False, 'phone': phone})
            return self.send_json({'found': False})
        if url.path == '/events/api/public/schedule':
            return self.send_json([
                {'id': 1, 'venue': '確認用の会場（見本）', 'area': '九州', 'start': '2026-12-03', 'end': '2026-12-07'},
                {'id': 2, 'venue': '確認用の会場 その2（見本）', 'area': '中四国', 'start': '2026-12-26', 'end': '2027-01-01'},
            ])
        return super().do_GET()

    def do_POST(self):
        url = urllib.parse.urlparse(self.path)
        length = int(self.headers.get('Content-Length') or 0)
        try:
            payload = json.loads(self.rfile.read(length).decode('utf-8') or '{}')
        except ValueError:
            return self.send_json({'error': 'invalid json'}, 400)
        STATE['log'].append({'path': url.path, 'payload': payload})
        total = int(re.sub(r'[^\d]', '', str(payload.get('total', ''))) or 0)
        points = int(payload.get('use_points') or 0)
        if url.path == '/payment/create-intent':
            if not STATE['sk']:
                return self.send_json({'error': '手元の確認用サーバーにテスト用の鍵が渡されていません'}, 502)
            amount = total - points
            if amount < 50:
                return self.send_json({'error': 'お支払い金額が小さすぎます（見本）'}, 400)
            try:
                intent = stripe_create_intent(amount)
            except (urllib.error.URLError, ValueError) as err:
                sys.stderr.write('[確認用サーバー] Stripe（テスト）で作れませんでした: %s\n' % err)
                return self.send_json({'error': '決済の準備に失敗しました'}, 502)
            return self.send_json({'client_secret': intent['client_secret'], 'amount': amount,
                                   'order_total': total, 'points_used': points})
        if url.path == '/orders/api/hp-order':
            earned = (total - points) // 200
            return self.send_json({'success': True, 'order_number': 'HP-見本-001',
                                   'point_info': '\nポイント: +%dpt（残高: %dpt / 会員#0001）' % (earned, 120 - points + earned),
                                   'line_linked': False, 'phone': re.sub(r'[\s\-()]', '', str(payload.get('phone', '')))})
        return self.send_json({'error': 'not found'}, 404)


def main():
    parser = argparse.ArgumentParser(description='新しいトップページの確認用サーバー（本番にはつながない）')
    parser.add_argument('--port', type=int, default=8985)
    parser.add_argument('--bind', default='127.0.0.1')
    parser.add_argument('--env-file', default=os.environ.get('AIKARO_ENV_FILE', ''),
                        help='Stripe のテスト用の鍵が書いてある鍵の紙（.env）の場所。無ければカードの入力欄は出ない')
    args = parser.parse_args()
    if args.env_file:
        STATE['pk'], STATE['sk'] = read_env_keys(args.env_file)
        print('Stripe：テスト用の鍵を読みました（カードの入力欄はテストの場所に出ます）')
    else:
        print('Stripe：鍵なし（カードの入力欄は出ません）')
    server = ThreadingHTTPServer((args.bind, args.port), Handler)
    print('開く場所： http://%s:%d/index-a.html  （止めるには Ctrl+C）' % (args.bind, args.port))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
