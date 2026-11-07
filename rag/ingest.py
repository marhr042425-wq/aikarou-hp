#!/usr/bin/env python3
"""会場ノウハウ（Markdown）を読み込んで Chroma に登録する。

knowledge/ 内の *.md を見出し（##）単位でチャンク化し、
会場名・ファイル名・見出しをメタデータとして付与する。

最小実装のため、実行のたびにコレクションを作り直す（全件再登録）。
メモを追記・編集したら、このスクリプトを1回実行すれば回答が最新になる。

実行: python ingest.py
"""
import re
import sys
from pathlib import Path

import chromadb
from chromadb.utils import embedding_functions

ROOT = Path(__file__).resolve().parent
KNOWLEDGE_DIR = ROOT / "knowledge"
DB_DIR = ROOT / "chroma_db"
COLLECTION_NAME = "venue_notes"
# 日本語に対応したローカル多言語埋め込みモデル（初回のみ自動ダウンロード）
EMBED_MODEL = "paraphrase-multilingual-MiniLM-L12-v2"


def parse_markdown(path: Path):
    """1つのMarkdownファイルを (会場名, [(見出し, 本文), ...]) に分割する。

    先頭の `# 見出し` を会場名とみなす。
    `## 見出し` ごとに1チャンク。最初の ## より前の本文は「概要」として扱う。
    `### ` 以下は親セクションの本文に含める。
    """
    venue = path.stem
    chunks = []
    heading = "概要"
    buf = []

    def flush():
        text = "\n".join(buf).strip()
        if text:
            chunks.append((heading, text))

    for line in path.read_text(encoding="utf-8").splitlines():
        m_section = re.match(r"^##\s+(.*)", line)
        m_title = re.match(r"^#\s+(.*)", line)
        if m_section:
            flush()
            heading = m_section.group(1).strip()
            buf = []
        elif m_title:
            venue = m_title.group(1).strip()
        else:
            buf.append(line)
    flush()
    return venue, chunks


def main():
    if not KNOWLEDGE_DIR.exists():
        print(f"知識ベースのフォルダがありません: {KNOWLEDGE_DIR}", file=sys.stderr)
        sys.exit(1)

    md_files = sorted(KNOWLEDGE_DIR.glob("*.md"))
    if not md_files:
        print(f"{KNOWLEDGE_DIR} に .md ファイルがありません。", file=sys.stderr)
        sys.exit(1)

    embedder = embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name=EMBED_MODEL
    )
    client = chromadb.PersistentClient(path=str(DB_DIR))

    # 全件再登録: 既存コレクションを消して作り直す（編集・削除も確実に反映される）
    try:
        client.delete_collection(COLLECTION_NAME)
    except Exception:
        pass
    collection = client.create_collection(
        name=COLLECTION_NAME, embedding_function=embedder
    )

    ids, docs, metas = [], [], []
    for path in md_files:
        venue, chunks = parse_markdown(path)
        for i, (heading, text) in enumerate(chunks):
            ids.append(f"{path.name}::{i}")
            # 検索精度のため、会場名と見出しも本文に含めて埋め込む
            docs.append(f"会場: {venue}\n項目: {heading}\n{text}")
            metas.append({"venue": venue, "file": path.name, "heading": heading})

    collection.add(ids=ids, documents=docs, metadatas=metas)

    print(f"登録完了: {len(md_files)} ファイル / {len(ids)} チャンク")
    for path in md_files:
        print(f"  - {path.name}")


if __name__ == "__main__":
    main()
