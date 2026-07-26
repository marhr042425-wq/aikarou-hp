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
        "slug": "yakishoronpo",
        "name": "焼き小籠包",
        "name_en": "Yaki Xiaolongbao",
        "image": "/images/yakishoronpo2.jpg",
        "tagline": "外カリッ！中ジュワ〜！コラーゲンスープが美味しい人気No.1",
        "description": "1度は食べてみたい一品！焼くことで皮はカリッと、中からコラーゲンたっぷりのスープがあふれ出します。",
        "weight": "1個 45g",
        "price_original": 900,
        "price_hp": 855,
        "unit_text": "4個（税込）",
        "allergens_icons": ["小麦"],
        "allergens_full": "小麦・大豆・豚肉・鶏肉・ゼラチン・ごま",
        "ingredients": "豚肉(国産)、オイスターソース(香港製造)、砂糖、野菜（玉葱、ねぎ）、胡麻油、胡椒、ゼラチン、醤油、食塩、チキンパウダー、皮（小麦粉(国内製造)、イースト）（一部に小麦・大豆・豚肉・鶏肉・ゼラチン・ごまを含む）／調味料（アミノ酸等）、香料、増粘剤(加工デンプン)、カラメル色素、ベーキングパウダー、アルコール、乳化剤（ソルビタン脂肪酸エステル）、V.C.",
        "nutrition": {
            "kcal": "—",
            "protein": "4.1g",
            "fat": "5.4g",
            "carb": "—",
            "salt": "0.44g",
        },
        "cooking_methods": [
            ("simple", "おすすめの調理方法", "フライパンに油をひき、凍ったまま並べる。差し水を入れフタをして3〜5分蒸し焼き。水分が飛んだらフタを取り、底面がカリッとするまで焼き上げる。"),
        ],
        "supplier_note": "製造者: 株式会社 王府井（神奈川県横浜市）",
        "tag": "人気No.1",
    },
    {
        "slug": "nikushumai",
        "additive_free": True,
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
        "cooking_methods": [
            ("raw", "🔹 生冷凍", "蒸し器または鍋に水を入れ沸騰させ、凍ったまま並べてフタをして10〜12分蒸す"),
            ("cooked", "🔥❄️ 加熱済冷凍", "霧吹き等で水をかけ、電子レンジで4個あたり600W約1分／500W約1分20秒"),
        ],
        "tag": "定番",
    },
    {
        "slug": "ebi-shumai",
        "additive_free": True,
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
        "cooking_methods": [
            ("raw", "🔹 生冷凍", "蒸し器または鍋に水を入れ沸騰させ、凍ったまま並べてフタをして10〜12分蒸す"),
            ("cooked", "🔥❄️ 加熱済冷凍", "霧吹き等で水をかけ、電子レンジで4個あたり600W約1分／500W約1分20秒"),
        ],
        "tag": "おすすめ",
    },
    {
        "slug": "niraniku",
        "additive_free": True,
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
        "cooking_methods": [
            ("raw", "🔹 生冷凍", "フライパン（テフロン加工は油なし）に凍ったまま並べ、差し水を少量入れフタをして蒸し焼き。皮が半透明になったらフタを取り、両面をカリッと焼き上げる"),
            ("cooked", "🔥❄️ 加熱済冷凍", "フライパン（テフロン加工は油なし）に凍ったまま並べ、両面が狐色になるまで焼く"),
        ],
        "tag": "定番",
    },
    {
        "slug": "chimaki",
        "name": "ちまき",
        "name_en": "Chinese Chimaki",
        "image": "/images/chimaki.jpg",
        "tagline": "豚肉角煮入りモッチモチ、何個でも食べられる",
        "description": "豚肉角煮が入ったモッチモチなちまき！何個でも食べてしまう飽きの来ない一品です。",
        "weight": "1個 60g",
        "price_original": 351,
        "price_hp": 333,
        "unit_text": "1個（税込）",
        "allergens_icons": ["小麦", "えび", "かに"],
        "allergens_full": "小麦・えび・かに・豚肉・大豆・鶏肉・りんご・ゼラチン・ごま",
        "ingredients": "もち米、豚肉、椎茸、醤油、香味油、ラード、干しエビ、干し大根、ポーク、チキンエキス、中国醤油、揚げネギ、砂糖、赤ワイン、清酒、ごま油、大豆油、にんにく、醸造酒、食塩、桂花醤、豆鼓、香辛料、生姜（一部に小麦・えび・かに・豚肉・大豆・鶏肉・りんご・ゼラチン・ごまを含む）／調味料（アミノ酸等）",
        "nutrition": {
            "kcal": "132kcal",
            "protein": "3.4g",
            "fat": "5.7g",
            "carb": "16.7g",
            "salt": "0.66g",
        },
        "cooking_methods": [
            ("simple", "おすすめの調理方法", "蒸し器で約10分蒸すか、電子レンジで温めてお召し上がりください。"),
        ],
        "tag": "人気",
    },
    {
        "slug": "nikuman",
        "name": "肉まん",
        "name_en": "Pork Bun",
        "image": "/images/nikuman.jpg",
        "tagline": "ふっくら生地に具がぎっしり、ボリューム満点",
        "description": "手作りの皮にこだわったふっくら生地に合う餡が絶妙な肉まん。具がぎっしり入ってボリューム感たっぷり！1度食べると味が忘れられない一品。",
        "weight": "1個 120g",
        "price_original": 540,
        "price_hp": 513,
        "unit_text": "1個（税込）",
        "allergens_icons": ["小麦", "乳"],
        "allergens_full": "小麦・大豆・乳・豚肉・ごま・ゼラチン",
        "ingredients": "小麦粉、食塩、大豆粉、イースト、ラード、豚肉、玉葱、椎茸、醤油、砂糖、ねぎ、ごま油、中国醤油、桂花醤、香辛料、生姜、ゼラチン、でん粉、香味油、みりん、長ネギ、粉末水あめ、大豆、ごま（一部に小麦・大豆・乳・豚肉・ごま・ゼラチンを含む）／調味料（アミノ酸等）、酸味料",
        "nutrition": {
            "kcal": "266kcal",
            "protein": "9.0g",
            "fat": "7.1g",
            "carb": "41.8g",
            "salt": "0.96g",
        },
        "cooking_methods": [
            ("simple", "おすすめの調理方法", "蒸し器で約10〜15分蒸し上げるか、電子レンジで温めてお召し上がりください。"),
        ],
        "tag": "ボリューム",
    },
    {
        "slug": "kakuni-burger",
        "name": "角煮バーガー",
        "name_en": "Kakuni Burger",
        "image": "/images/kakuni-burger.jpg",
        "tagline": "甘だれ角煮を割りパンに挟んだ堪らない一品",
        "description": "じっくりコトコトに煮込んだ甘だれの角煮を、割りパンに挟んだ堪らない一品。中華風バーガーをお楽しみください。",
        "weight": "1個 90g",
        "price_original": 540,
        "price_hp": 513,
        "unit_text": "1個（税込）",
        "allergens_icons": ["小麦", "卵", "かに"],
        "allergens_full": "小麦・卵・かに・豚肉・大豆・ゼラチン",
        "ingredients": "小麦粉、食塩、大豆粉、イースト、ラード、加工卵黄、豚肉、醤油、砂糖、生姜、長ネギ、清酒、赤ワイン、桂花醤、豆鼓、中国醤油、でん粉、大豆油、香味料（一部に小麦・卵・かに・豚肉・大豆・ゼラチンを含む）／醸造酒、香辛料、膨張剤、増粘剤、調味料（アミノ酸等）",
        "nutrition": {
            "kcal": "280kcal",
            "protein": "8.3g",
            "fat": "13.8g",
            "carb": "30.6g",
            "salt": "0.27g",
        },
        "cooking_methods": [
            ("simple", "おすすめの調理方法", "電子レンジで温めてお召し上がりください。"),
        ],
        "tag": "ボリューム",
    },
    {
        "slug": "charshuman",
        "name": "チャーシューまん",
        "name_en": "Char Siu Bun",
        "image": "/images/charshuman.jpg",
        "tagline": "ミルク練り込みの細やかな生地にチャーシュー餡",
        "description": "ミルクを練りこんだキメの細かい生地！チャーシュー餡を包んだ飲茶！おやつなど小腹の空いた時にぴったり！",
        "weight": "1個 50g",
        "price_original": 351,
        "price_hp": 333,
        "unit_text": "1個（税込）",
        "allergens_icons": ["小麦", "卵"],
        "allergens_full": "小麦・卵・豚肉・大豆・ごま",
        "ingredients": "小麦粉、卵白、ラード、小麦たん白、イースト、大豆粉、豚肉、砂糖、醤油、香味油、でん粉、中国醤油、玉葱、生姜、長ネギ、オイスターソース、食塩、ごま油、大豆油、味噌、芝麻醤、醸造酒、紅南乳、甘味噌、香辛料（一部に小麦・卵・豚肉・大豆・ごまを含む）／膨張剤、増粘剤、調味料（アミノ酸等）、安定剤、着色料、リン酸塩、酢酸Na、香料、ビタミンB1",
        "nutrition": {
            "kcal": "118kcal",
            "protein": "3.4g",
            "fat": "2.9g",
            "carb": "19.7g",
            "salt": "0.75g",
        },
        "cooking_methods": [
            ("simple", "おすすめの調理方法", "蒸し器で約8〜10分蒸し上げるか、電子レンジで温めてお召し上がりください。"),
        ],
        "tag": "おやつ",
    },
    {
        "slug": "zasai",
        "name": "ザーサイ",
        "name_en": "Zha Cai (Pickled Mustard)",
        "image": "/images/zasai.jpg",
        "tagline": "食物繊維豊富な中華のお漬物、お酒の肴やラーメンに",
        "description": "中華のお漬物、食物繊維が豊富でお酒の肴に！ご飯のお供！1度食べるとやみつきになる事間違いなし！ラーメンにも相性抜群！",
        "weight": "140g",
        "price_original": 800,
        "price_hp": 760,
        "unit_text": "140g（税込）",
        "allergens_icons": ["大豆", "ごま"],
        "allergens_full": "大豆・ごま（※特定原材料8品目には該当なし）",
        "ingredients": "ザーサイ(中国)、漬け原材料（還元水飴、アミノ酸液、胡麻油、食塩、ラー油、植物油）（一部に大豆・ごまを含む）／調味料（アミノ酸等）、塩化Ca、酸味料、保存料（ソルビン酸K）、香辛料抽出物",
        "nutrition": {
            "kcal": "102kcal",
            "protein": "2.4g",
            "fat": "6.0g",
            "carb": "11.3g",
            "salt": "3.4g",
            "note": "100g当たり",
        },
        "cooking_methods": [
            ("simple", "おすすめの召し上がり方", "そのままお召し上がりいただけます。ラーメンの具、ご飯のお供、お酒の肴にどうぞ。要冷蔵（10℃以下で保存）。"),
        ],
        "supplier_note": "製造者: マニハ食品株式会社（群馬県）",
        "tag": "やみつき",
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
    badge_class = {"raw": "raw", "cooked": "cooked", "simple": "simple"}
    for kind, label, body in p.get("cooking_methods", []):
        bc = badge_class.get(kind, "simple")
        cook_blocks.append(f"""
      <div class="pp-cook-card">
        <div class="pp-cook-badge {bc}">{escape(label)}</div>
        <p>{escape(body)}</p>
      </div>""")
    cook_html = "\n".join(cook_blocks)
    nut = p["nutrition"]
    supplier_note_html = f'<p class="pp-supplier-note">{escape(p["supplier_note"])}</p>' if p.get("supplier_note") else ""
    # 「保存料・着色料・増量剤・膨張剤 不使用」は原材料に該当添加物がない商品のみ表示
    additive_free_html = (
        '<p class="pp-additive-free">保存料・着色料・増量剤・膨張剤 不使用</p>'
        if p.get("additive_free") else ""
    )
    nut_note = nut.get("note") or f"1個{p['weight'].split(' ')[1] if ' ' in p['weight'] else p['weight']}当たり"

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
.pp-hero {{ background: linear-gradient(135deg, #8b0000 0%, #c41e3a 100%); color: #fff; padding: 0.85rem 1.25rem 1rem; text-align: center; }}
.pp-hero .breadcrumb {{ font-size: 0.72rem; opacity: 0.85; margin-bottom: 0.35rem; color: #fff; }}
.pp-hero .breadcrumb a {{ color: #ffd700; text-decoration: none; }}
.pp-hero h1 {{ margin: 0; font-size: 1.25rem; color: #fff; line-height: 1.2; }}
.pp-hero .en {{ font-size: 0.7rem; opacity: 0.8; margin-top: 0.1rem; letter-spacing: 0.1em; }}
.pp-hero .tagline {{ margin-top: 0.3rem; color: #ffd700; font-size: 0.82rem; line-height: 1.3; }}
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
.pp-additive-free {{ color: #ffd700; font-size: 0.9rem; font-weight: 700; margin-top: 0.75rem; }}
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
.pp-cook-badge.simple {{ background: #ffd700; color: #1a1a1a; }}
.pp-supplier-note {{ color: #888; font-size: 0.85rem; margin-top: 0.75rem; font-style: italic; }}
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
    {additive_free_html}
    {supplier_note_html}
  </section>

  <section class="pp-section">
    <h2>栄養成分（{escape(nut_note)}）</h2>
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
.pi-hero {{ background: linear-gradient(135deg, #8b0000 0%, #c41e3a 100%); color: #fff; padding: 0.85rem 1.25rem 1rem; text-align: center; }}
.pi-hero .breadcrumb {{ font-size: 0.72rem; opacity: 0.85; margin-bottom: 0.35rem; color: #fff; }}
.pi-hero .breadcrumb a {{ color: #ffd700; text-decoration: none; }}
.pi-hero h1 {{ margin: 0; font-size: 1.2rem; color: #fff; line-height: 1.2; }}
.pi-hero p {{ margin: 0.2rem 0 0; opacity: 0.9; color: #fff; font-size: 0.78rem; }}
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
