# -*- coding: utf-8 -*-
"""chars.json の字だけを抜いた書体ファイルを作る。使い方: python fonts_subset.py <chars.json> <元の書体の場所> <出力先>
（fonttools と brotli が入ったPythonで動かす。元の書体＝ShipporiMinchoB1-Medium.ttf / -ExtraBold.ttf）"""
import sys, os, json
from fontTools import subset
from fontTools.ttLib import TTFont
chars, src, out = sys.argv[1:4]
J = json.load(open(chars, encoding='utf-8'))
os.makedirs(out, exist_ok=True)
for w, name in (('500', 'ShipporiMinchoB1-Medium.ttf'), ('800', 'ShipporiMinchoB1-ExtraBold.ttf')):
    f = TTFont(os.path.join(src, name))
    o = subset.Options(); o.flavor = 'woff2'; o.layout_features = ['kern', 'palt', 'vert', 'vrt2', 'vkrn', 'vpal', 'liga', 'locl', 'ccmp']
    o.name_IDs = [1, 2]; o.notdef_outline = True; o.desubroutinize = True; o.hinting = False
    s = subset.Subsetter(o); s.populate(text=J[w]); s.subset(f)
    f.flavor = 'woff2'; p = os.path.join(out, 'smb1-%s.woff2' % w); f.save(p)
    print(p, os.path.getsize(p), 'bytes', len(J[w]), '字')
