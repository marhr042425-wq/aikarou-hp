#!/usr/bin/env python3
"""会場ノウハウに質問し、根拠（参照元）付きで回答する。

実行: python ask.py "イオン摂津富田の精算フローは？"
"""
import os
import sys
from pathlib import Path

import chromadb
from chromadb.utils import embedding_functions
from anthropic import Anthropic
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
DB_DIR = ROOT / "chroma_db"
COLLECTION_NAME = "venue_notes"
EMBED_MODEL = "paraphrase-multilingual-MiniLM-L12-v2"
MODEL = "claude-sonnet-4-6"
TOP_K = 4

SYSTEM_PROMPT = """あなたは催事会場の運用ノウハウに答えるアシスタントです。
以下のルールを厳守してください。
- 回答は、与えられた「会場メモ」の内容だけを根拠にする。推測で補わない。
- メモに該当情報がなければ「該当するメモが見つかりませんでした」と正直に答える。
- 簡潔に、現場ですぐ使える形で答える。
"""


def main():
    if len(sys.argv) < 2:
        print('使い方: python ask.py "質問文"', file=sys.stderr)
        sys.exit(1)
    question = " ".join(sys.argv[1:])

    load_dotenv(ROOT / ".env")
    if not os.getenv("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY が設定されていません（.env を確認）。", file=sys.stderr)
        sys.exit(1)

    embedder = embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name=EMBED_MODEL
    )
    client = chromadb.PersistentClient(path=str(DB_DIR))
    try:
        collection = client.get_collection(
            name=COLLECTION_NAME, embedding_function=embedder
        )
    except Exception:
        print(
            "ベクトルDBが見つかりません。先に `python ingest.py` を実行してください。",
            file=sys.stderr,
        )
        sys.exit(1)

    res = collection.query(query_texts=[question], n_results=TOP_K)
    docs = res["documents"][0]
    metas = res["metadatas"][0]

    if not docs:
        print("該当するメモが見つかりませんでした。")
        return

    # 検索したメモを番号付きで整形（参照元を明示できるように）
    context_parts = []
    for i, (doc, meta) in enumerate(zip(docs, metas), 1):
        context_parts.append(
            f"[{i}] 会場: {meta['venue']} / 項目: {meta['heading']} "
            f"(出典: {meta['file']})\n{doc}"
        )
    context = "\n\n".join(context_parts)

    user_prompt = (
        f"# 会場メモ（検索結果）\n{context}\n\n"
        f"# 質問\n{question}\n\n"
        "上のメモだけを根拠に回答してください。"
    )

    response = Anthropic().messages.create(
        model=MODEL,
        max_tokens=1500,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    )
    answer = "".join(b.text for b in response.content if b.type == "text")

    print(answer.strip())
    print("\n--- 参照元 ---")
    seen = set()
    for meta in metas:
        key = (meta["file"], meta["heading"])
        if key in seen:
            continue
        seen.add(key)
        print(f"  ・{meta['venue']} / {meta['heading']}（{meta['file']}）")


if __name__ == "__main__":
    main()
