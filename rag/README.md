# 催事ノウハウ RAG エージェント（最小構成）

会場ごとの運用ノウハウ（Markdownメモ）を知識ベース化し、
「○○会場で気をつけることは？」に **根拠（参照元）付き** で答える CLI です。

既存の静的サイト（このリポジトリのルート）とは独立した別系統です。
この `rag/` フォルダ内で完結します。

## 技術構成

| 役割 | 採用 |
|---|---|
| 知識ベース | `knowledge/` 内の Markdown（1会場1ファイル） |
| 埋め込み（ベクトル化） | ローカル多言語モデル `paraphrase-multilingual-MiniLM-L12-v2`（追加APIキー不要・日本語対応） |
| ベクトルDB | Chroma（ローカル・永続化、`chroma_db/`） |
| 生成 | Claude API `claude-sonnet-4-6` |
| インターフェース | CLI（`ingest.py` / `ask.py`） |

## セットアップ

```bash
cd rag
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env              # .env を開いて ANTHROPIC_API_KEY を記入
```

> 初回の `ingest.py` / `ask.py` 実行時に、埋め込みモデル（数百MB）が自動ダウンロードされます。

## 使い方

### 1. 会場メモを登録する

```bash
python ingest.py
```

`knowledge/*.md` を読み込み、見出し（`##`）単位でチャンク化して Chroma に登録します。
**メモを追記・編集したら、このコマンドを1回叩けば回答が最新になります**（全件再登録）。

### 2. 質問する

```bash
python ask.py "イオン摂津富田の精算フローは？"
python ask.py "現金を持ち帰る会場はどこ？"
```

関連メモを検索し、その内容だけを根拠に回答します。回答の末尾に参照元（会場名・項目・ファイル名）が付きます。

## メモの追記方法（随時追記が前提）

`knowledge/` に Markdown ファイルを置く／追記するだけです。フォーマット:

```markdown
# 会場名（←ファイルの先頭。会場名になる）

## 精算フロー
ここに本文…

## 搬入ルール
ここに本文…

## 電源・什器
…

## 売れ筋
…
```

- **1会場1ファイル**（ファイル名は半角英数のスラッグ推奨。例: `aeon-higashiura.md`）
- 項目（`##`）は埋まったところから書けばOK。全部揃っていなくても問題ありません。
- 各 `##` セクションが検索の1単位（チャンク）になります。
- 書いたら `python ingest.py` を実行 → すぐ反映されます。

## ファイル構成

```
rag/
├── README.md            # このファイル
├── requirements.txt     # 依存ライブラリ
├── .env.example         # APIキーのテンプレート（.env にコピーして使う）
├── .gitignore           # .env / chroma_db/ を除外
├── knowledge/           # ★会場メモ置き場（ここに追記していく）
│   └── aeon-foodstyle-settsu-tonda.md
├── ingest.py            # メモ → ベクトルDB 登録（再実行で最新化）
├── ask.py               # 質問 → 検索 → 根拠付き回答
└── chroma_db/           # ベクトルDB本体（自動生成・git管理外）
```

## メモ

- `chroma_db/` は `ingest.py` でいつでも再構築できるため Git 管理外（`.gitignore`）です。
- 将来的な拡張（Render の売上DB連携、Obsidian連携など）は今回のスコープ外です。
  まずはこの最小構成で「登録 → 質問 → 追記して最新化」が回ることをゴールにしています。
