#!/usr/bin/env python3
"""リンク集ページ自動生成スクリプト

aikaro.jp/links/ を商品マスタ (generate_product_lps.PRODUCTS) と
催事API (Render) の最新情報から再生成する。SNSプロフィールリンクに使う。

実行: python3 scripts/generate_links_page.py
"""

import sys
import json
import urllib.request
from datetime import date
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LINKS_DIR = ROOT / "links"
LINKS_DIR.mkdir(exist_ok=True)

sys.path.insert(0, str(ROOT / "scripts"))
from generate_product_lps import PRODUCTS  # noqa: E402
from generate_event_lps import clean_display_name  # noqa: E402

API_URL = "https://akira042425-1.onrender.com/events/api/public/schedule"

PRODUCT_ICONS = {
    "yakishoronpo": "🥟",
    "nikushumai": "🥟",
    "ebi-shumai": "🦐",
    "niraniku": "🥬",
    "chimaki": "🍙",
    "nikuman": "🍞",
    "kakuni-burger": "🍔",
    "charshuman": "🍞",
    "zasai": "🥢",
}


def fetch_next_event():
    try:
        req = urllib.request.Request(API_URL, headers={"User-Agent": "aikaro-links-gen"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        today = date.today().isoformat()
        upcoming = [e for e in data if e.get("end", "") >= today]
        upcoming.sort(key=lambda e: e.get("start", ""))
        return upcoming[0] if upcoming else None
    except Exception as exc:
        print(f"[warn] 催事API取得失敗: {exc}", file=sys.stderr)
        return None


def render_product_button(p):
    icon = PRODUCT_ICONS.get(p["slug"], "🥟")
    price = p.get("price_hp", "")
    unit = p.get("unit_text", "")
    sub_parts = []
    if p.get("tagline"):
        tag = p["tagline"]
        if len(tag) > 24:
            tag = tag[:24] + "…"
        sub_parts.append(tag)
    if price:
        sub_parts.append(f"¥{price}")
    sub = " / ".join(sub_parts) if sub_parts else escape(unit)
    return f"""  <a class="lk-btn" href="/products/{escape(p['slug'])}/">
    <div class="lk-btn-icon">{icon}</div>
    <div class="lk-btn-text">
      {escape(p['name'])}
      <div class="lk-btn-sub">{escape(sub)}</div>
    </div>
    <div class="lk-btn-arrow">›</div>
  </a>"""


def render_event_button(next_ev):
    if next_ev:
        today = date.today().isoformat()
        is_active = next_ev.get("start", "") <= today <= next_ev.get("end", "")
        prefix = "🔥 出店中" if is_active else "📅 次回催事"
        name = clean_display_name(next_ev.get("venue") or next_ev.get("name") or "")
        period = f"{next_ev.get('start','')} 〜 {next_ev.get('end','')}"
        href = f"/events/{next_ev['id']}/" if next_ev.get("id") else "/events/"
        sub = f"{prefix} ・ {period}"
        return f"""  <a class="lk-btn lk-btn-primary" href="{escape(href)}">
    <div class="lk-btn-icon">📍</div>
    <div class="lk-btn-text">
      {escape(name)}
      <div class="lk-btn-sub">{escape(sub)}</div>
    </div>
    <div class="lk-btn-arrow">›</div>
  </a>
  <a class="lk-btn" href="/events/">
    <div class="lk-btn-icon">🗓</div>
    <div class="lk-btn-text">
      全催事スケジュール
      <div class="lk-btn-sub">今後の出店一覧を見る</div>
    </div>
    <div class="lk-btn-arrow">›</div>
  </a>"""
    return """  <a class="lk-btn lk-btn-primary" href="/events/">
    <div class="lk-btn-icon">📍</div>
    <div class="lk-btn-text">
      出店スケジュール
      <div class="lk-btn-sub">今後の催事一覧・会場情報</div>
    </div>
    <div class="lk-btn-arrow">›</div>
  </a>"""


def render_page():
    next_ev = fetch_next_event()
    event_btn = render_event_button(next_ev)
    product_btns = "\n".join(render_product_button(p) for p in PRODUCTS)

    all_products_btn = f"""  <a class="lk-btn" href="/products/">
    <div class="lk-btn-icon">🍽</div>
    <div class="lk-btn-text">
      全商品を見る
      <div class="lk-btn-sub">{len(PRODUCTS)}商品の詳細・原材料・アレルゲン</div>
    </div>
    <div class="lk-btn-arrow">›</div>
  </a>"""

    return f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>リンク集｜本格中華 愛華楼</title>
<meta name="description" content="本格中華 愛華楼の公式リンク集。商品ページ・催事スケジュール・SNSへのリンクをまとめています。">
<link rel="canonical" href="https://aikaro.jp/links/">
<meta property="og:title" content="本格中華 愛華楼 公式リンク集">
<meta property="og:description" content="商品ページ・催事スケジュール・SNSへのリンクをまとめています。">
<meta property="og:url" content="https://aikaro.jp/links/">
<meta property="og:type" content="website">
<meta property="og:image" content="https://aikaro.jp/images/yakishoronpo.jpg">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary_large_image">
<style>
  *, *::before, *::after {{ box-sizing: border-box; }}
  body {{
    margin: 0;
    background: #0d0d0d;
    color: #f5f5f5;
    font-family: 'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif;
    min-height: 100vh;
  }}
  .lk-page {{ max-width: 520px; margin: 0 auto; padding: 2rem 1.25rem 3rem; }}
  .lk-hero {{ text-align: center; padding: 1.5rem 0 1.75rem; }}
  .lk-hero img.lk-logo {{
    width: 96px; height: 96px; border-radius: 50%; object-fit: cover;
    border: 3px solid #ffd700; background: #1a1a1a;
  }}
  .lk-hero h1 {{ margin: 0.75rem 0 0.25rem; font-size: 1.4rem; color: #fff; letter-spacing: 0.05em; }}
  .lk-hero p {{ margin: 0; color: #999; font-size: 0.9rem; }}
  .lk-section-label {{
    color: #999; font-size: 0.75rem; letter-spacing: 0.1em;
    text-transform: uppercase; margin: 1.75rem 0 0.75rem; padding-left: 0.25rem;
  }}
  .lk-btn {{
    display: flex; align-items: center; gap: 0.85rem;
    padding: 0.95rem 1.1rem; background: #1a1a1a;
    border: 1px solid #2a2a2a; border-radius: 14px;
    color: #f5f5f5; text-decoration: none; margin-bottom: 0.65rem;
    transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
    font-size: 0.98rem;
  }}
  .lk-btn:hover, .lk-btn:active {{
    transform: translateY(-2px);
    box-shadow: 0 6px 18px rgba(196,30,58,0.25);
    border-color: #c41e3a;
  }}
  .lk-btn-primary {{
    background: linear-gradient(135deg, #8b0000 0%, #c41e3a 100%);
    border-color: transparent; color: #fff; font-weight: 700;
  }}
  .lk-btn-primary:hover {{ box-shadow: 0 8px 22px rgba(196,30,58,0.45); }}
  .lk-btn-icon {{
    width: 36px; height: 36px; border-radius: 8px;
    background: #2a2a2a; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 1.3rem;
  }}
  .lk-btn-primary .lk-btn-icon {{ background: rgba(255,255,255,0.18); }}
  .lk-btn-text {{ flex: 1; line-height: 1.3; }}
  .lk-btn-sub {{ color: #999; font-size: 0.78rem; margin-top: 0.15rem; }}
  .lk-btn-primary .lk-btn-sub {{ color: rgba(255,255,255,0.85); }}
  .lk-btn-arrow {{ color: #666; font-size: 1.1rem; }}
  .lk-btn-primary .lk-btn-arrow {{ color: #fff; }}
  .lk-footer {{ text-align: center; margin-top: 2.5rem; color: #555; font-size: 0.75rem; }}
  .lk-footer a {{ color: #999; text-decoration: none; }}
</style>
</head>
<body>
<main class="lk-page">

  <header class="lk-hero">
    <img class="lk-logo" src="/images/yakishoronpo.jpg" alt="本格中華 愛華楼">
    <h1>本格中華 愛華楼</h1>
    <p>全国の催事で本格点心をお届け</p>
  </header>

  <div class="lk-section-label">📅 催事スケジュール</div>

{event_btn}

  <div class="lk-section-label">🥟 商品ラインナップ</div>

{all_products_btn}

{product_btns}

  <div class="lk-section-label">🌐 公式サイト</div>

  <a class="lk-btn" href="/">
    <div class="lk-btn-icon">🏮</div>
    <div class="lk-btn-text">
      愛華楼 公式ホームページ
      <div class="lk-btn-sub">aikaro.jp</div>
    </div>
    <div class="lk-btn-arrow">›</div>
  </a>

  <footer class="lk-footer">
    © 本格中華 愛華楼 ・ <a href="/">aikaro.jp</a>
  </footer>

</main>
</body>
</html>
"""


def main():
    html = render_page()
    out = LINKS_DIR / "index.html"
    out.write_text(html, encoding="utf-8")
    print(f"[ok] {out.relative_to(ROOT)} ({len(PRODUCTS)} products)")


if __name__ == "__main__":
    main()
