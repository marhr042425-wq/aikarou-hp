#!/usr/bin/env python3
"""催事LP自動生成スクリプト

催事システム（Render）の公開APIから催事一覧を取得し、
催事ごとの個別LP（aikaro.jp/events/{id}/index.html）と
催事一覧ページ（aikaro.jp/events/index.html）を生成する。

毎日ローカルルーチンから実行され、git commit & push で GitHub Pages に反映される。

実行: python3 scripts/generate_event_lps.py
"""

import json
import os
import shutil
import sys
import urllib.request
from datetime import date, datetime
from html import escape
from pathlib import Path

API_URL = "https://akira042425-1.onrender.com/events/api/public/schedule"
ROOT = Path(__file__).resolve().parent.parent
EVENTS_DIR = ROOT / "events"

WEEKDAY_JA = ["月", "火", "水", "木", "金", "土", "日"]


def fetch_events():
    """公開APIから催事一覧を取得"""
    with urllib.request.urlopen(API_URL, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def fmt_date_range(start_str, end_str):
    """日付を「5月8日(金)〜5月12日(火)」形式に整形"""
    try:
        s = datetime.strptime(start_str, "%Y-%m-%d").date()
        e = datetime.strptime(end_str, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return f"{start_str} 〜 {end_str}"
    s_str = f"{s.month}月{s.day}日({WEEKDAY_JA[s.weekday()]})"
    if s == e:
        return s_str
    if s.month == e.month:
        e_str = f"{e.day}日({WEEKDAY_JA[e.weekday()]})"
    else:
        e_str = f"{e.month}月{e.day}日({WEEKDAY_JA[e.weekday()]})"
    return f"{s_str} 〜 {e_str}"


def is_active(event):
    """催事が現在も予定/開催中か判定（end_date >= today）"""
    try:
        end = datetime.strptime(event.get("end", ""), "%Y-%m-%d").date()
    except ValueError:
        return False
    return end >= date.today()


def render_event_lp(event):
    """1催事のLP HTML を生成"""
    eid = event.get("id", "")
    name = event.get("name", "")
    venue = event.get("venue", "") or name
    address = event.get("address", "")
    area = event.get("area", "")
    start = event.get("start", "")
    end = event.get("end", "")

    title = f"{venue}｜愛華楼 催事出店"
    description = f"{fmt_date_range(start, end)} に {venue} で愛華楼が出店します。本格点心（肉焼売・海老焼売・ニラまんじゅう）の販売・実演をお楽しみください。"
    canonical = f"https://aikaro.jp/events/{eid}/"
    map_query = address or venue
    map_url = f"https://www.google.com/maps/search/?api=1&query={escape(map_query)}"

    # JSON-LD Event schema
    schema = {
        "@context": "https://schema.org",
        "@type": "Event",
        "name": f"愛華楼 出店：{venue}",
        "startDate": start,
        "endDate": end,
        "eventStatus": "https://schema.org/EventScheduled",
        "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
        "location": {
            "@type": "Place",
            "name": venue,
        },
        "organizer": {
            "@type": "Organization",
            "name": "本格中華 愛華楼",
            "url": "https://aikaro.jp/",
        },
        "url": canonical,
    }
    if address:
        schema["location"]["address"] = address

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
<meta property="og:type" content="website">
<meta property="og:locale" content="ja_JP">
<meta property="og:image" content="https://aikaro.jp/images/event-booth.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{escape(title)}">
<meta name="twitter:description" content="{escape(description)}">
<script type="application/ld+json">
{schema_json}
</script>
<link rel="stylesheet" href="/styles.css">
<style>
body {{ background: #0d0d0d; color: #f5f5f5; margin: 0; font-family: 'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif; }}
.event-lp {{ min-height: 100vh; }}
.event-hero {{
  background: linear-gradient(135deg, #8b0000 0%, #c41e3a 100%);
  color: #fff;
  padding: 4rem 1.5rem 3rem;
  text-align: center;
}}
.event-hero .breadcrumb {{ font-size: 0.85rem; opacity: 0.85; margin-bottom: 1rem; color: #fff; }}
.event-hero .breadcrumb a {{ color: #ffd700; text-decoration: none; }}
.event-hero h1 {{ font-size: 2rem; margin: 0 0 1rem; line-height: 1.3; color: #fff; }}
.event-hero .event-period {{ font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem; color: #ffd700; }}
.event-hero .event-area {{ display: inline-block; padding: 0.25rem 0.85rem; border-radius: 999px; background: rgba(255,255,255,0.15); font-size: 0.875rem; color: #fff; }}
.event-body {{ max-width: 720px; margin: 0 auto; padding: 2.5rem 1.5rem; color: #f5f5f5; }}
.event-section {{ margin-bottom: 2.5rem; }}
.event-section h2 {{ font-size: 1.25rem; border-bottom: 2px solid #ffd700; padding-bottom: 0.5rem; margin-bottom: 1rem; color: #ffd700; }}
.event-info-table {{ width: 100%; border-collapse: collapse; }}
.event-info-table th, .event-info-table td {{ text-align: left; padding: 0.75rem 0.5rem; border-bottom: 1px solid #2a2a2a; vertical-align: top; }}
.event-info-table th {{ width: 6em; color: #999; font-weight: 500; }}
.event-info-table td {{ color: #f5f5f5; }}
.event-map-btn {{ display: inline-block; margin-top: 0.75rem; padding: 0.6rem 1.2rem; background: #4285f4; color: #fff; border-radius: 6px; text-decoration: none; font-size: 0.95rem; }}
.event-products {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; }}
.event-product {{ text-align: center; }}
.event-product img {{ width: 100%; border-radius: 8px; aspect-ratio: 1/1; object-fit: cover; }}
.event-product .name {{ font-weight: 700; margin-top: 0.5rem; font-size: 0.95rem; color: #f5f5f5; }}
.event-note {{ color: #999; font-size: 0.9rem; margin-bottom: 1rem; }}
.event-cta {{ text-align: center; margin-top: 2.5rem; padding: 2rem 1.5rem; background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%); border: 1px solid #ffd700; border-radius: 12px; }}
.event-cta h3 {{ margin: 0 0 0.5rem; color: #ffd700; }}
.event-cta p {{ color: #ccc; margin: 0.5rem 0; }}
.event-cta-btns {{ display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; margin-top: 1rem; }}
.event-cta-btn {{ display: inline-block; padding: 0.75rem 1.5rem; border-radius: 999px; text-decoration: none; font-weight: 700; font-size: 0.95rem; }}
.event-cta-btn.line {{ background: #06c755; color: #fff; }}
.event-cta-btn.shop {{ background: #c41e3a; color: #fff; }}
.event-cta-btn.hp {{ background: transparent; color: #ffd700; border: 1px solid #ffd700; }}
.event-footer {{ text-align: center; padding: 2rem 1rem; color: #666; font-size: 0.85rem; border-top: 1px solid #2a2a2a; }}
.event-footer a {{ color: #ffd700; }}
</style>
</head>
<body class="event-lp">
<header class="event-hero">
  <div class="breadcrumb"><a href="/">愛華楼トップ</a> ＞ <a href="/events/">催事一覧</a> ＞ 出店情報</div>
  <h1>{escape(venue)}</h1>
  <div class="event-period">{escape(fmt_date_range(start, end))}</div>
  {f'<span class="event-area">{escape(area)}エリア</span>' if area else ''}
</header>

<main class="event-body">
  <section class="event-section">
    <h2>📍 出店情報</h2>
    <table class="event-info-table">
      <tr><th>催事名</th><td>{escape(name)}</td></tr>
      <tr><th>会場</th><td>{escape(venue)}</td></tr>
      {f'<tr><th>住所</th><td>{escape(address)}</td></tr>' if address else ''}
      <tr><th>期間</th><td>{escape(fmt_date_range(start, end))}</td></tr>
      {f'<tr><th>エリア</th><td>{escape(area)}</td></tr>' if area else ''}
    </table>
    <a class="event-map-btn" href="{map_url}" target="_blank" rel="noopener">🗺 地図で見る</a>
  </section>

  <section class="event-section">
    <h2>🥟 当日の販売商品</h2>
    <p class="event-note">本格点心を実演販売いたします。商品ラインナップは催事により異なる場合があります。</p>
    <div class="event-products">
      <div class="event-product">
        <img src="/images/nikushyumai.jpg" alt="肉焼売">
        <div class="name">肉焼売</div>
      </div>
      <div class="event-product">
        <img src="/images/ebi-shumai.jpg" alt="海老焼売">
        <div class="name">海老焼売</div>
      </div>
      <div class="event-product">
        <img src="/images/niraniku.jpg" alt="肉にら饅頭">
        <div class="name">肉にら饅頭</div>
      </div>
      <div class="event-product">
        <img src="/images/yakishoronpo2.jpg" alt="焼き小籠包">
        <div class="name">焼き小籠包</div>
      </div>
    </div>
  </section>

  <section class="event-cta">
    <h3>会場に行けない方も</h3>
    <p>通販・LINE注文で全国お届けいたします<br>（催事リピーターはHP注文で5%OFF）</p>
    <div class="event-cta-btns">
      <a class="event-cta-btn shop" href="/#orderform">通販で注文</a>
      <a class="event-cta-btn line" href="https://lin.ee/wbAZif6" target="_blank" rel="noopener">LINEで注文</a>
      <a class="event-cta-btn hp" href="/">愛華楼トップへ</a>
    </div>
  </section>
</main>

<footer class="event-footer">
  <p>© 本格中華 愛華楼 ｜ <a href="/">aikaro.jp</a></p>
</footer>
</body>
</html>
"""


def render_events_index(events):
    """催事一覧ページのHTML"""
    cards_html = []
    for ev in events:
        eid = ev.get("id", "")
        venue = ev.get("venue", "") or ev.get("name", "")
        area = ev.get("area", "")
        period = fmt_date_range(ev.get("start", ""), ev.get("end", ""))
        cards_html.append(f"""
      <a class="ev-card" href="/events/{eid}/">
        <div class="ev-card-period">{escape(period)}</div>
        <div class="ev-card-venue">{escape(venue)}</div>
        {f'<div class="ev-card-area">{escape(area)}エリア</div>' if area else ''}
      </a>""")

    if not cards_html:
        cards_html.append('<p style="text-align:center; color:#666; padding:2rem;">現在予定されている催事はありません。最新情報は <a href="/">トップページ</a> または LINE でお知らせいたします。</p>')

    cards_block = "\n".join(cards_html)
    return f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>催事スケジュール｜本格中華 愛華楼</title>
<meta name="description" content="本格中華 愛華楼の催事出店スケジュール。各百貨店・スーパー・イオンモール等での実演販売情報をお知らせします。">
<link rel="canonical" href="https://aikaro.jp/events/">
<meta property="og:title" content="催事スケジュール｜本格中華 愛華楼">
<meta property="og:description" content="愛華楼の催事出店スケジュール一覧。お近くの会場で実演販売中の本格点心をお楽しみください。">
<meta property="og:url" content="https://aikaro.jp/events/">
<meta property="og:type" content="website">
<meta property="og:image" content="https://aikaro.jp/images/event-booth.jpg">
<link rel="stylesheet" href="/styles.css">
<style>
body {{ background: #0d0d0d; color: #f5f5f5; margin: 0; font-family: 'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif; }}
.events-index {{ min-height: 100vh; }}
.events-hero {{ background: linear-gradient(135deg, #8b0000 0%, #c41e3a 100%); color: #fff; padding: 3rem 1.5rem; text-align: center; }}
.events-hero .breadcrumb {{ font-size: 0.85rem; opacity: 0.85; margin-bottom: 1rem; color: #fff; }}
.events-hero .breadcrumb a {{ color: #ffd700; text-decoration: none; }}
.events-hero h1 {{ margin: 0; font-size: 2rem; color: #fff; }}
.events-hero p {{ margin: 0.5rem 0 0; opacity: 0.9; color: #fff; }}
.events-list {{ max-width: 720px; margin: 0 auto; padding: 2rem 1.5rem; display: grid; gap: 1rem; }}
.ev-card {{ display: block; padding: 1.25rem; background: #1a1a1a; border: 1px solid #2a2a2a; border-left: 4px solid #c41e3a; border-radius: 8px; text-decoration: none; color: #f5f5f5; transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s; }}
.ev-card:hover {{ transform: translateY(-2px); box-shadow: 0 8px 20px rgba(196,30,58,0.2); border-left-color: #ffd700; }}
.ev-card-period {{ font-size: 0.9rem; color: #ffd700; font-weight: 700; }}
.ev-card-venue {{ font-size: 1.1rem; font-weight: 700; margin-top: 0.3rem; color: #fff; }}
.ev-card-area {{ font-size: 0.8rem; color: #999; margin-top: 0.3rem; }}
.events-footer {{ text-align: center; padding: 2rem 1rem; color: #666; font-size: 0.85rem; border-top: 1px solid #2a2a2a; }}
.events-footer a {{ color: #ffd700; }}
</style>
</head>
<body class="events-index">
<header class="events-hero">
  <div class="breadcrumb"><a href="/">愛華楼トップ</a> ＞ 催事一覧</div>
  <h1>催事スケジュール</h1>
  <p>各会場での実演販売情報</p>
</header>
<main class="events-list">
{cards_block}
</main>
<footer class="events-footer">
  <p>© 本格中華 愛華楼 ｜ <a href="/">aikaro.jp</a></p>
</footer>
</body>
</html>
"""


def generate(events):
    """催事LPと一覧ページを生成。古いディレクトリは削除。"""
    EVENTS_DIR.mkdir(exist_ok=True)
    active_events = [e for e in events if is_active(e)]
    active_ids = {str(e.get("id")) for e in active_events if e.get("id")}

    # 既存ディレクトリのうち、APIに無いものは削除（過去催事の片付け）
    if EVENTS_DIR.exists():
        for d in EVENTS_DIR.iterdir():
            if d.is_dir() and d.name not in active_ids:
                shutil.rmtree(d)
                print(f"  - removed: events/{d.name}/")

    # 各催事のLPを生成
    for ev in active_events:
        eid = str(ev.get("id"))
        if not eid:
            continue
        ev_dir = EVENTS_DIR / eid
        ev_dir.mkdir(exist_ok=True)
        html = render_event_lp(ev)
        (ev_dir / "index.html").write_text(html, encoding="utf-8")
        print(f"  + generated: events/{eid}/ ({ev.get('venue', '')})")

    # 催事一覧ページ
    index_html = render_events_index(active_events)
    (EVENTS_DIR / "index.html").write_text(index_html, encoding="utf-8")
    print(f"  + generated: events/index.html ({len(active_events)} events)")

    return len(active_events)


def main():
    try:
        events = fetch_events()
    except Exception as e:
        print(f"ERROR: API取得失敗: {e}", file=sys.stderr)
        return 1
    print(f"取得した催事: {len(events)}件")
    count = generate(events)
    print(f"✓ 完了: 公開催事 {count}件")
    return 0


if __name__ == "__main__":
    sys.exit(main())
