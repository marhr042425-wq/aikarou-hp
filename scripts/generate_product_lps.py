#!/usr/bin/env python3
"""商品LP自動生成スクリプト

愛華楼の自社商品（肉焼売・海老焼売・ニラまんじゅう等）の個別LPと
商品一覧ページ（aikaro.jp/products/）を生成する。

商品データはこのスクリプト内で管理（後日マスタDB化も可能）。

実行: python3 scripts/generate_product_lps.py
"""

import json
import sys
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PRODUCTS_DIR = ROOT / "products"

PRODUCTS = [
    {
        "slug": "nikushumai",
        "name": "肉焼売",
        "name_en": "Pork Shumai",
        "image": "/images/nikushyumai.jpg",
        "tagline": "国産豚肉ジューシー、タレ要らずの定番点心",
        "description": "増量剤を一切使わず国産豚肉をふんだんに使った、タレの要らないにくにくジューシーな焼売。一口噛むと肉汁があふれる、箸が止まらない一品です。",
        "weight": "1個 40g",
        "price_original": 800,
        "price_hp": 760,
        "unit_text": "4個（税込）",
        "allergens_icons": ["小麦", "卵"],
        "allergens_full": "小麦・卵・ごま・大豆・豚肉",
        "ingredients": "豚肉(国産)、玉葱、皮（小麦粉(国内製造)、でん粉）、片栗粉、背脂、砂糖、オイスターソース、清酒、ごま油、生姜、ラード、卵白、食塩、コショウ、醤油（一部に小麦・卵・ごま・大豆・豚肉を含む）／調味料（アミノ酸等）、加工でん粉、ソルビトール、酒精、酸味料",
        "nutrition": {
            "kcal": "72kcal",
            "protein": "4.19g",
            "fat": "3.41g",
            "carb": "3.51g",
            "salt": "0.45g",
        },
        "cooking_raw": "蒸し器または鍋に水を入れ沸騰させ、凍ったまま並べてフタをして10〜12分蒸す",
        "cooking_cooked": "霧吹き等で水をかけ、電子レンジで4個あたり600W約1分／500W約1分20秒",
        "has_raw": True,
        "has_cooked": True,
        "tag": "定番",
    },
    {
        "slug": "ebi-shumai",
        "name": "海老焼売",
        "name_en": "Shrimp Shumai",
        "image": "/images/ebi-shumai.jpg",
        "tagline": "海老プリプリ、新食感のえび焼売",
        "description": "海老をふんだんに使ったプリプリ感がやみつきになる新食感！これぞ海老焼売という存在感のある一品です。",
        "weight": "1個 40g",
        "price_original": 800,
        "price_hp": 760,
        "unit_text": "4個（税込）",
        "allergens_icons": ["えび", "小麦", "卵"],
        "allergens_full": "えび・小麦・卵・ごま・大豆・豚肉",
        "ingredients": "えび(インドネシア産)、筍、皮（小麦粉(国内製造)、でん粉）、背脂、コーンスターチ、砂糖、醤油、ラード、卵白、ねりごま、生姜、ごま油、清酒、食塩（一部にえび・小麦・卵・ごま・大豆・豚肉を含む）／調味料（アミノ酸等）、加工でん粉、ソルビトール、酒精、酸味料",
        "nutrition": {
            "kcal": "77kcal",
            "protein": "6.08g",
            "fat": "1.56g",
            "carb": "6.03g",
            "salt": "0.38g",
        },
        "cooking_raw": "蒸し器または鍋に水を入れ沸騰させ、凍ったまま並べてフタをして10〜12分蒸す",
        "cooking_cooked": "霧吹き等で水をかけ、電子レンジで4個あたり600W約1分／500W約1分20秒",
        "has_raw": True,
        "has_cooked": True,
        "tag": "おすすめ",
    },
    {
        "slug": "niraniku",
        "name": "肉にら饅頭",
        "name_en": "Nira-Niku Manju",
        "image": "/images/niraniku.jpg",
        "tagline": "肉とニラのジューシーな相性、お酒の肴にも最高",
        "description": "餃子の一種、お酒の肴、ご飯のお供！肉とニラの相性が堪らない肉たっぷりなニラ饅頭。香ばしく焼き上げて出来上がりです。",
        "weight": "1個 30g",
        "price_original": 800,
        "price_hp": 760,
        "unit_text": "4個（税込）",
        "allergens_icons": ["小麦", "卵"],
        "allergens_full": "小麦・卵・ごま・大豆・豚肉",
        "ingredients": "豚肉(国産)、ニラ、玉葱、皮（小麦粉(国内製造)、でん粉）、片栗粉、背脂、醤油、砂糖、オイスターソース、生姜、清酒、ごま油、卵白、食塩、コショウ（一部に小麦・卵・ごま・大豆・豚肉を含む）／調味料（アミノ酸等）、加工でん粉、ソルビトール、酒精、酸味料",
        "nutrition": {
            "kcal": "57kcal",
            "protein": "3.28g",
            "fat": "2.52g",
            "carb": "3.49g",
            "salt": "0.32g",
        },
        "cooking_raw": "フライパン（テフロン加工は油なし）に凍ったまま並べ、差し水を少量入れフタをして蒸し焼き。皮が半透明になったらフタを取り、両面をカリッと焼き上げる",
        "cooking_cooked": "フライパン（テフロン加工は油なし）に凍ったまま並べ、両面が狐色になるまで焼く",
        "has_raw": True,
        "has_cooked": True,
        "tag": "定番",
    },
]


def render_product_lp(p):
    """商品LP HTML"""
    title = f"{p['name']}｜本格中華 愛華楼"
    description = f"{p['name']} — {p['tagline']}。{p['description'][:60]}…"
    canonical = f"https://aikaro.jp/products/{p['slug']}/"

    allergens_icons_html = "".join(
        f'<span class="pp-allergen-icon">{escape(a)}</span>' for a in p["allergens_icons"]
    )

    cook_blocks = []
    if p.get("has_raw"):
        cook_blocks.append(f"""
      <div class="pp-cook-card">
        <div class="pp-cook-badge raw">🔹 生冷凍</div>
        <p>{escape(p['cooking_raw'])}</p>
      </div>""")
    if p.get("has_cooked"):
        cook_blocks.append(f"""
      <div class="pp-cook-card">
        <div class="pp-cook-badge cooked">🔥❄️ 加熱済冷凍</div>
        <p>{escape(p['cooking_cooked'])}</p>
      </div>""")

    cook_html = "\n".join(cook_blocks)
    nut = p["nutrition"]

    schema = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": p["name"],
        "description": p["description"],
        "image": f"https://aikaro.jp{p['image']}",
        "brand": {"@type": "Brand", "name": "愛華楼"},
        "offers": {
            "@type": "Offer",
            "url": canonical,
            "priceCurrency": "JPY",
            "price": p["price_hp"],
            "availability": "https://schema.org/InStock",
        },
    }
    schema_json = json.dumps(schema, ensure_ascii=False, indent=2)

    return f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{escape(title)}</title>
<meta name="description" content="{escape(description)}">
<link rel="canonical" href="{canonical}">
<meta property="og:title" content="{escape(title)}">
<meta property="og:description" content="{escape(description)}">
<meta property="og:url" content="{canonical}">
<meta property="og:type" content="product">
<meta property="og:locale" content="ja_JP">
<meta property="og:image" content="https://aikaro.jp{p['image']}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{escape(title)}">
<meta name="twitter:description" content="{escape(description)}">
<script type="application/ld+json">
{schema_json}
</script>
<link rel="stylesheet" href="/styles.css">
<style>
body {{ background: #0d0d0d; color: #f5f5f5; margin: 0; font-family: 'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif; }}
.pp-page {{ min-height: 100vh; }}
.pp-hero {{ background: linear-gradient(135deg, #8b0000 0%, #c41e3a 100%); color: #fff; padding: 1.5rem 1.5rem 1.75rem; text-align: center; }}
.pp-hero .breadcrumb {{ font-size: 0.8rem; opacity: 0.85; margin-bottom: 0.75rem; color: #fff; }}
.pp-hero .breadcrumb a {{ color: #ffd700; text-decoration: none; }}
.pp-hero h1 {{ margin: 0; font-size: 1.5rem; color: #fff; }}
.pp-hero .en {{ font-size: 0.8rem; opacity: 0.85; margin-top: 0.2rem; letter-spacing: 0.1em; }}
.pp-hero .tagline {{ margin-top: 0.6rem; color: #ffd700; font-size: 0.95rem; }}
.pp-image-wrap {{ max-width: 480px; margin: 0 auto; padding: 0 1.5rem; }}
.pp-image {{ width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.5); margin-top: -1rem; position: relative; z-index: 2; }}
.pp-body {{ max-width: 720px; margin: 0 auto; padding: 2rem 1.5rem; }}
.pp-section {{ margin-bottom: 2.5rem; }}
.pp-section h2 {{ font-size: 1.2rem; border-bottom: 2px solid #ffd700; padding-bottom: 0.5rem; color: #ffd700; margin-bottom: 1rem; }}
.pp-desc {{ color: #e0e0e0; line-height: 1.8; }}
.pp-price-row {{ display: flex; align-items: baseline; gap: 0.75rem; flex-wrap: wrap; }}
.pp-price-original {{ color: #999; text-decoration: line-through; }}
.pp-price-hp {{ color: #ffd700; font-size: 1.8rem; font-weight: 700; }}
.pp-price-unit {{ color: #999; font-size: 0.9rem; }}
.pp-tag {{ display: inline-block; padding: 0.15rem 0.6rem; border-radius: 999px; background: #c41e3a; color: #fff; font-size: 0.75rem; margin-left: 0.5rem; }}
.pp-allergen-row {{ margin-bottom: 0.75rem; }}
.pp-allergen-icon {{ display: inline-block; padding: 0.2rem 0.6rem; margin-right: 0.4rem; background: #c41e3a; color: #fff; border-radius: 4px; font-size: 0.85rem; font-weight: 700; }}
.pp-allergen-full {{ color: #ccc; font-size: 0.95rem; }}
.pp-allergen-full strong {{ color: #ffd700; margin-right: 0.5rem; }}
.pp-ingredients {{ color: #b0b0b0; font-size: 0.9rem; line-height: 1.7; padding: 1rem; background: #1a1a1a; border-radius: 8px; }}
.pp-nutrition {{ width: 100%; border-collapse: collapse; background: #1a1a1a; border-radius: 8px; overflow: hidden; }}
.pp-nutrition th, .pp-nutrition td {{ padding: 0.6rem 0.85rem; text-align: left; border-bottom: 1px solid #2a2a2a; }}
.pp-nutrition th {{ color: #999; font-weight: 500; width: 8em; }}
.pp-nutrition td {{ color: #f5f5f5; font-weight: 600; }}
.pp-nutrition tr:last-child th, .pp-nutrition tr:last-child td {{ border-bottom: none; }}
.pp-nutrition-note {{ color: #777; font-size: 0.8rem; margin-top: 0.5rem; }}
.pp-cook-grid {{ display: grid; gap: 1rem; }}
.pp-cook-card {{ background: #1a1a1a; padding: 1.25rem; border-radius: 8px; border-left: 4px solid #ffd700; }}
.pp-cook-badge {{ display: inline-block; padding: 0.25rem 0.75rem; border-radius: 4px; font-size: 0.85rem; font-weight: 700; margin-bottom: 0.75rem; }}
.pp-cook-badge.raw {{ background: #1e88e5; color: #fff; }}
.pp-cook-badge.cooked {{ background: #d32f2f; color: #fff; }}
.pp-cook-card p {{ margin: 0; color: #e0e0e0; line-height: 1.7; }}
.pp-cta {{ text-align: center; margin-top: 2.5rem; padding: 2rem 1.5rem; background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%); border: 1px solid #ffd700; border-radius: 12px; }}
.pp-cta h3 {{ margin: 0 0 0.5rem; color: #ffd700; }}
.pp-cta p {{ color: #ccc; margin: 0.5rem 0; }}
.pp-cta-btns {{ display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; margin-top: 1rem; }}
.pp-cta-btn {{ display: inline-block; padding: 0.75rem 1.5rem; border-radius: 999px; text-decoration: none; font-weight: 700; font-size: 0.95rem; }}
.pp-cta-btn.line {{ background: #06c755; color: #fff; }}
.pp-cta-btn.shop {{ background: #c41e3a; color: #fff; }}
.pp-cta-btn.hp {{ background: transparent; color: #ffd700; border: 1px solid #ffd700; }}
.pp-footer {{ text-align: center; padding: 2rem 1rem; color: #666; font-size: 0.85rem; border-top: 1px solid #2a2a2a; }}
.pp-footer a {{ color: #ffd700; }}
</style>
</head>
<body class="pp-page">
<header class="pp-hero">
  <div class="breadcrumb"><a href="/">愛華楼トップ</a> ＞ <a href="/products/">商品一覧</a> ＞ {escape(p['name'])}</div>
  <h1>{escape(p['name'])}</h1>
  <div class="en">{escape(p.get('name_en', ''))}</div>
  <div class="tagline">{escape(p['tagline'])}</div>
</header>

<div class="pp-image-wrap">
  <img class="pp-image" src="{escape(p['image'])}" alt="{escape(p['name'])}">
</div>

<main class="pp-body">
  <section class="pp-section">
    <h2>商品について</h2>
    <p class="pp-desc">{escape(p['description'])}</p>
  </section>

  <section class="pp-section">
    <h2>価格・内容量</h2>
    <div class="pp-price-row">
      <span class="pp-price-original">¥{p['price_original']}</span>
      <span class="pp-price-hp">¥{p['price_hp']}</span>
      <span class="pp-price-unit">/ {escape(p['unit_text'])}</span>
      <span class="pp-tag">{escape(p['tag'])}</span>
    </div>
    <p class="pp-nutrition-note">※ HP価格は催事リピーター 5%OFF 適用後の表示価格です。内容量: {escape(p['weight'])}</p>
  </section>

  <section class="pp-section">
    <h2>アレルゲン</h2>
    <div class="pp-allergen-row">{allergens_icons_html}</div>
    <div class="pp-allergen-full"><strong>含まれるアレルゲン</strong>{escape(p['allergens_full'])}</div>
  </section>

  <section class="pp-section">
    <h2>調理方法</h2>
    <div class="pp-cook-grid">{cook_html}
    </div>
  </section>

  <section class="pp-section">
    <h2>原材料名</h2>
    <p class="pp-ingredients">{escape(p['ingredients'])}</p>
  </section>

  <section class="pp-section">
    <h2>栄養成分（1個{escape(p['weight'].split(' ')[1] if ' ' in p['weight'] else p['weight'])}当たり）</h2>
    <table class="pp-nutrition">
      <tr><th>エネルギー</th><td>{escape(nut['kcal'])}</td></tr>
      <tr><th>たんぱく質</th><td>{escape(nut['protein'])}</td></tr>
      <tr><th>脂質</th><td>{escape(nut['fat'])}</td></tr>
      <tr><th>炭水化物</th><td>{escape(nut['carb'])}</td></tr>
      <tr><th>食塩相当量</th><td>{escape(nut['salt'])}</td></tr>
    </table>
    <p class="pp-nutrition-note">この表示値は、目安です。</p>
  </section>

  <section class="pp-cta">
    <h3>ご注文はこちらから</h3>
    <p>BASE・LINE・通販フォーム、お好みの方法でどうぞ</p>
    <div class="pp-cta-btns">
      <a class="pp-cta-btn shop" href="/#orderform">通販で注文</a>
      <a class="pp-cta-btn line" href="https://lin.ee/wbAZif6" target="_blank" rel="noopener">LINEで注文</a>
      <a class="pp-cta-btn hp" href="/products/">他の商品</a>
    </div>
  </section>
</main>

<footer class="pp-footer">
  <p>© 本格中華 愛華楼 ｜ <a href="/">aikaro.jp</a></p>
</footer>
</body>
</html>
"""


def render_products_index():
    """商品一覧ページ"""
    cards_html = []
    for p in PRODUCTS:
        cards_html.append(f"""
      <a class="pi-card" href="/products/{p['slug']}/">
        <img src="{escape(p['image'])}" alt="{escape(p['name'])}">
        <div class="pi-card-body">
          <div class="pi-card-name">{escape(p['name'])}</div>
          <div class="pi-card-tagline">{escape(p['tagline'])}</div>
          <div class="pi-card-price">¥{p['price_hp']} <small>/ {escape(p['unit_text'])}</small></div>
        </div>
      </a>""")
    cards = "\n".join(cards_html)
    return f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>商品一覧｜本格中華 愛華楼</title>
<meta name="description" content="本格中華 愛華楼の商品一覧。肉焼売・海老焼売・肉にら饅頭など本格点心の詳細情報をご紹介。">
<link rel="canonical" href="https://aikaro.jp/products/">
<meta property="og:title" content="商品一覧｜本格中華 愛華楼">
<meta property="og:description" content="愛華楼の本格点心 商品一覧。アレルゲン・原材料・調理方法も掲載。">
<meta property="og:url" content="https://aikaro.jp/products/">
<meta property="og:type" content="website">
<meta property="og:image" content="https://aikaro.jp/images/yakishoronpo.jpg">
<link rel="stylesheet" href="/styles.css">
<style>
body {{ background: #0d0d0d; color: #f5f5f5; margin: 0; font-family: 'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif; }}
.pi-page {{ min-height: 100vh; }}
.pi-hero {{ background: linear-gradient(135deg, #8b0000 0%, #c41e3a 100%); color: #fff; padding: 1.75rem 1.5rem; text-align: center; }}
.pi-hero .breadcrumb {{ font-size: 0.8rem; opacity: 0.85; margin-bottom: 0.75rem; color: #fff; }}
.pi-hero .breadcrumb a {{ color: #ffd700; text-decoration: none; }}
.pi-hero h1 {{ margin: 0; font-size: 1.6rem; color: #fff; }}
.pi-hero p {{ margin: 0.4rem 0 0; opacity: 0.9; color: #fff; font-size: 0.9rem; }}
.pi-list {{ max-width: 720px; margin: 0 auto; padding: 2rem 1.5rem; display: grid; gap: 1.25rem; }}
.pi-card {{ display: flex; gap: 1rem; padding: 1rem; background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 12px; text-decoration: none; color: #f5f5f5; transition: transform 0.15s, box-shadow 0.15s; }}
.pi-card:hover {{ transform: translateY(-2px); box-shadow: 0 8px 20px rgba(196,30,58,0.2); }}
.pi-card img {{ width: 100px; height: 100px; object-fit: cover; border-radius: 8px; flex-shrink: 0; }}
.pi-card-body {{ flex: 1; }}
.pi-card-name {{ font-size: 1.15rem; font-weight: 700; color: #fff; }}
.pi-card-tagline {{ color: #999; font-size: 0.9rem; margin-top: 0.3rem; }}
.pi-card-price {{ color: #ffd700; font-size: 1.1rem; font-weight: 700; margin-top: 0.5rem; }}
.pi-card-price small {{ color: #999; font-weight: 400; font-size: 0.75rem; }}
.pi-footer {{ text-align: center; padding: 2rem 1rem; color: #666; font-size: 0.85rem; border-top: 1px solid #2a2a2a; }}
.pi-footer a {{ color: #ffd700; }}
</style>
</head>
<body class="pi-page">
<header class="pi-hero">
  <div class="breadcrumb"><a href="/">愛華楼トップ</a> ＞ 商品一覧</div>
  <h1>商品一覧</h1>
  <p>本格点心の詳細情報</p>
</header>
<main class="pi-list">
{cards}
</main>
<footer class="pi-footer">
  <p>© 本格中華 愛華楼 ｜ <a href="/">aikaro.jp</a></p>
</footer>
</body>
</html>
"""


def main():
    PRODUCTS_DIR.mkdir(exist_ok=True)
    for p in PRODUCTS:
        product_dir = PRODUCTS_DIR / p["slug"]
        product_dir.mkdir(exist_ok=True)
        (product_dir / "index.html").write_text(render_product_lp(p), encoding="utf-8")
        print(f"  + generated: products/{p['slug']}/ ({p['name']})")

    (PRODUCTS_DIR / "index.html").write_text(render_products_index(), encoding="utf-8")
    print(f"  + generated: products/index.html ({len(PRODUCTS)} products)")
    print(f"✓ 完了: 商品LP {len(PRODUCTS)}件")
    return 0


if __name__ == "__main__":
    sys.exit(main())
