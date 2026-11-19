#!/usr/bin/env python3
"""トップページ用の「軽い版の写真」を作り直す道具（手元のMacで使う）。

元の JPEG（images/〇〇.jpg）は一切書き換えない。隣に
  images/〇〇-<幅>.webp
を作るだけ。index.html の <picture> がこれを出し分ける。

使い方:
    python3 scripts/build_images.py            # 全部作り直す
    python3 scripts/build_images.py --check    # 作らずに「足りない／古い」だけ調べる

決まり:
- 元より大きく引き伸ばさない（元の幅を超える版は作らない。最大の版＝元の幅）。
- charshuman.jpg / chimaki.jpg は CMYK（色の決まりが付いていない）で、iPhone と
  Chrome で元から色の出方が違う。RGB に直すとどちらかの見え方が変わるので、
  「どちらの色が正しいか」が決まるまで軽い版は作らない（JPEG のまま出す）。
- 催事ページの共有用の絵（event-booth-og.jpg）もここで作る。縦長の元写真から
  1200×630 を切り出す（切り出し位置は下の OG_CROP）。
- 写真を差し替えたら、これを回して index.html の width/height と
  幅の一覧（srcset）が合っているか tests/test_images.cjs で確かめる。

AVIF という形式ならさらに 15〜20% 軽くなるが、枚数が倍になるので今は WebP だけ
（2026-11-17 に試して見送り）。足すなら FORMATS に "avif" を足して <picture> に
<source type="image/avif"> を先頭に置く。

必要なもの: Pillow（WebP が書ける版）。GitHub Actions では使わない。
"""
import sys
from pathlib import Path

from PIL import Image, features

IMAGES = Path(__file__).resolve().parent.parent / "images"

# 写真ごとの「作る幅」。いちばん大きい数字は元の幅と同じ（引き伸ばさない）。
#   ヒーロー          : 携帯 約310px・PC 最大600px で表示
#   店長イチオシ      : 最大500px
#   写真の帯          : 画面の幅いっぱい
#   メニューのカード  : 約330〜345px
VARIANTS = {
    "yakishoronpo.jpg": [480, 800, 960, 1300],
    "ebi-shumai.jpg": [400, 640, 850],
    "yakishoronpo2.jpg": [400, 640, 800, 1200, 1800],
    "nikushyumai.jpg": [400, 640, 850],
    "niraniku.jpg": [400, 640, 800],
    "nikuman.jpg": [400, 611],
    "kakuni-burger.jpg": [400, 640, 800],
    "zasai.jpg": [400, 704],
    "mongol-tea.jpg": [400, 704],
}

FORMATS = ("webp",)
WEBP_QUALITY = 80
AVIF_QUALITY = 62

# 催事ページの共有用（LINE・SNS に貼ったとき出る絵）
OG_SOURCE = "event-booth.jpg"
OG_OUTPUT = "event-booth-og.jpg"
OG_SIZE = (1200, 630)
# 元写真（2376×4224）のどこを切り出すか: (左, 上, 右, 下)。
# 売り台の商品と「愛華楼」の文字が入る位置。
OG_CROP = (0, 2250, 2376, 2250 + 1247)
OG_QUALITY = 82


def targets():
    for name, widths in VARIANTS.items():
        stem = Path(name).stem
        for w in widths:
            for ext in FORMATS:
                yield name, w, IMAGES / f"{stem}-{w}.{ext}"


def build_one(src: Path, width: int, out: Path) -> None:
    with Image.open(src) as im:
        if im.mode != "RGB":
            raise SystemExit(f"{src.name}: RGB ではありません（{im.mode}）。軽い版は作りません。")
        if width > im.width:
            raise SystemExit(f"{src.name}: 元の幅 {im.width}px より大きい版（{width}px）は作りません。")
        if width != im.width:
            height = round(im.height * width / im.width)
            im = im.resize((width, height), Image.LANCZOS)
        # 色の決まり（ICC）は sRGB か無しのどちらかなので付けない＝どの端末でも同じ扱い
        if out.suffix == ".webp":
            im.save(out, "WEBP", quality=WEBP_QUALITY, method=6)
        else:
            im.save(out, "AVIF", quality=AVIF_QUALITY, speed=4)


def build_og() -> None:
    with Image.open(IMAGES / OG_SOURCE) as im:
        im = im.convert("RGB").crop(OG_CROP).resize(OG_SIZE, Image.LANCZOS)
        im.save(IMAGES / OG_OUTPUT, "JPEG", quality=OG_QUALITY, optimize=True, progressive=True)


def main() -> int:
    check_only = "--check" in sys.argv[1:]
    if not check_only and not all(features.check(f) for f in FORMATS):
        raise SystemExit("この Pillow は " + "・".join(FORMATS) + " を書けません。新しい Pillow を使ってください。")

    stale = []
    for name, width, out in targets():
        src = IMAGES / name
        if not out.exists() or out.stat().st_mtime < src.stat().st_mtime:
            stale.append(out.name)
        if not check_only:
            build_one(src, width, out)
    og = IMAGES / OG_OUTPUT
    if not og.exists() or og.stat().st_mtime < (IMAGES / OG_SOURCE).stat().st_mtime:
        stale.append(og.name)
    if not check_only:
        build_og()

    if check_only:
        if stale:
            print("作り直しが要るもの:")
            for s in stale:
                print("  ", s)
            return 1
        print("軽い版はそろっています。")
        return 0

    total = sum(out.stat().st_size for _, _, out in targets()) + og.stat().st_size
    print(f"作りました: {len(list(targets())) + 1} 枚・合計 {total / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
