# 本格中華 愛華楼 ホームページ 引き継ぎドキュメント

**作成日**: 2026年3月29日

---

## 1. プロジェクト概要

- **サイト名**: 本格中華 愛華楼
- **種類**: 1ページLP（シングルページ）
- **場所**: `/Users/akira/Pictures/aikarou-hp/`
- **技術**: HTML + CSS + JavaScript（全てindex.html内にインライン）
- **外部依存**: Google Fonts（Noto Serif JP, Noto Sans JP）のみ
- **サーバーサイド不要**: 静的HTMLのみ

---

## 2. ファイル構成

```
aikarou-hp/
├── index.html          （1170行、メインページ）
└── images/
    ├── yakishoronpo.jpg    （ヒーロー用 焼き小籠包）
    ├── yakishoronpo2.jpg   （メニュー用 焼き小籠包）
    ├── nikushyumai.jpg     （肉焼売）
    ├── ebishumai.jpg       （海老焼売）
    ├── niraniku.jpg        （肉にら饅頭）
    ├── chimaki.jpg         （ミニちまき）
    ├── nikuman.jpg         （肉まん）
    ├── kakuniburger.jpg    （角煮バーガー）
    ├── charshuman.jpg      （チャーシューまん）
    ├── zasai.jpg           （ザーサイ）
    ├── storefront.jpg      （店舗外観）
    └── event-booth.jpg     （催事ブース）
```

合計サイズ: 約8MB

---

## 3. セクション構成

| # | セクション | ID | 状態 | 内容 |
|---|----------|-----|------|------|
| 1 | ヒーロー | `#top` | 完成 | タイトル、キャッチコピー、CTA2つ、焼き小籠包写真 |
| 2 | 愛華楼について | `#about` | 完成 | 店舗紹介テキスト、装飾アイコン |
| 3 | 店長イチオシ | `#featured` | 完成 | 海老焼売のフィーチャー、注文ボタン |
| 4 | メニュー | `#menu` | 完成 | 全9品カード表示（全て実写真） |
| 5 | 配送について | `#delivery` | 完成 | ¥1,000〜配送可、¥2,000〜配送無料 |
| 6 | 催事スケジュール | `#schedule` | 仮表示 | 「近日公開」テキスト |
| 7 | ご注文方法 | `#order` | 完成 | BASEショップ・LINE・電話の3方法 |
| 8 | お問い合わせ | `#contact` | 完成 | 店舗情報 + 問い合わせフォーム |
| 9 | フッター | - | 完成 | コピーライト |

---

## 4. メニュー一覧（全9品）

| 商品名 | 価格 | 単位 | タグ | 画像ファイル |
|--------|------|------|------|-------------|
| 焼き小籠包 | ¥650 | 4個 | 人気No.1 | yakishoronpo2.jpg |
| 肉焼売（大） | ¥500 | 4個 | 定番 | nikushyumai.jpg |
| 海老焼売（大） | ¥650 | 4個 | おすすめ | ebishumai.jpg |
| 肉にら饅頭 | ¥500 | 5個 | 定番 | niraniku.jpg |
| ミニちまき | ¥250 | 1個 | 人気 | chimaki.jpg |
| 肉まん（大） | ¥360 | 1個 | 定番 | nikuman.jpg |
| 角煮バーガー | ¥380 | 1個 | おすすめ | kakuniburger.jpg |
| チャーシューまん | ¥200 | 1個 | お手頃 | charshuman.jpg |
| ザーサイ | ¥400 | 100g | 冷凍可 | zasai.jpg |

---

## 5. 店舗情報

- **店舗名**: 本格中華 愛華楼
- **住所**: 〒811-3209 福岡県福津市花見ヶ丘3-22-20
- **営業時間**: 12:00〜20:00
- **電話（配送）**: 090-2096-1896
- **電話（店舗）**: 0940-43-6496
- **BASEショップ**: https://imazuya.thebase.in/

---

## 6. デザイン仕様

- **カラースキーム**: 黒背景（#0d0d0d）× ゴールド（#D4A843）× 赤（#B22222）
- **フォント**: Noto Serif JP（見出し）、Noto Sans JP（本文）
- **スタイル**: 高級中華レストラン風、固定ヘッダー、ハンバーガーメニュー
- **アニメーション**: スクロール時のフェードイン（IntersectionObserver + `.fade-up` → `.visible`）
- **レスポンシブ対応**: モバイル対応済み

---

## 7. 技術的な注意点

### スクロールアニメーション
- `.fade-up`クラスの要素はデフォルトで`opacity: 0`
- IntersectionObserverで画面内に入ると`.visible`クラスが付与され表示される
- `threshold: 0.1`で設定

### お問い合わせフォーム
- フォーム送信は`handleSubmit()`関数で処理
- 現在はフロントエンドのみ（バックエンド未接続）
- メール送信等のサーバー処理が必要な場合は別途実装が必要

### LINEリンク
- 現在`href="#"`のプレースホルダー → 実際のLINE公式アカウントURLに差し替えが必要

---

## 8. 写真の元ファイル（ダウンロードフォルダ）

| 使用画像 | 元ファイル |
|---------|----------|
| yakishoronpo2.jpg | DSCF009401-20150323-155301124.jpg |
| nikushyumai.jpg | IMG_0618.JPG |
| ebishumai.jpg | IMG_0617.JPG |
| kakuniburger.jpg | IMG_0563.jpg |
| charshuman.jpg | IMG_4709.jpg |
| zasai.jpg | Excelファイル「味付ザーサイ POP」から抽出 |
| niraniku.jpg | IMG_0619.JPG |
| chimaki.jpg | IMG_0782.JPG |
| nikuman.jpg | IMG_0785.JPG |

その他Downloadsにある未使用写真:
- IMG_4400.jpg（肉まんアップ）
- IMG_4402.jpg（肉まん蒸籠）
- IMG_4680.jpg（ちまき竹皮）
- IMG_1260.JPG（愛華楼チラシ全体）
- 正宗生煎包1.jpg（ロゴ）
- 生煎包 20130702...jpg（焼き小籠包 別カット）
- images-20150329...jpg（焼き小籠包 宣伝画像）
- 愛華楼様 株式会社クリエル.png（デザイン参考）

---

## 9. 今後の対応候補

- [ ] LINEリンクを実際のURLに差し替え
- [ ] 催事スケジュールセクションに実データを反映
- [ ] お問い合わせフォームのバックエンド実装
- [ ] 本番サーバーへのデプロイ（Render / Netlify / GitHub Pages等）
- [ ] OGP画像の設定（SNSシェア用）
- [ ] Google Analytics等のアクセス解析導入

---

*このドキュメントは2026年3月29日時点の状態です*
