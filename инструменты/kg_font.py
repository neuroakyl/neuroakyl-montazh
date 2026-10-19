"""Дорисовать кыргызские ө Ө ң Ң (и ү = у) в шрифт, где их нет. Образец — каллиграфия Great Vibes (OFL).

  .venv/bin/python инструменты/kg_font.py ВХОД.ttf ВЫХОД.ttf
Координаты штрихов подобраны под Great Vibes: для другого шрифта поправить числа в make(...) и проверить кадром.
Штрих внутри «о» рисуется против часовой, иначе он вырезается. После правки менять имя файла шрифта (кэш браузера).
"""
import sys, math
from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.transformPen import TransformPen
src, dst = sys.argv[1], sys.argv[2]
t = TTFont(src); cm = t.getBestCmap(); gs = t.getGlyphSet(); glyf = t['glyf']; hm = t['hmtx']
SL = math.tan(math.radians(14))  # наклон каллиграфии
def bar(pen, x0, x1, y, th, tilt=0.0):
    # тонкий штрих с наклоном и чуть приподнятым правым концом
    pts = [(x0 + SL*(y), y), (x1 + SL*(y+tilt), y+tilt), (x1 + SL*(y+tilt+th), y+tilt+th), (x0 + SL*(y+th), y+th)][::-1]
    pen.moveTo(pts[0]); [pen.lineTo(p) for p in pts[1:]]; pen.closePath()
def tail(pen, x, y0, y1, th):
    pts = [(x + SL*y0, y0), (x + th + SL*y0, y0), (x + th - 25 + SL*y1, y1), (x - 25 + SL*y1, y1)]
    pen.moveTo(pts[0]); [pen.lineTo(p) for p in pts[1:]]; pen.closePath()
def make(newcode, base, extra):
    name = f"uni{newcode:04X}"
    pen = TTGlyphPen(gs)
    gs[cm[base]].draw(pen)
    if extra: extra(pen)
    glyf[name] = pen.glyph()
    hm[name] = hm[cm[base]]
    if name not in t.getGlyphOrder():
        t.setGlyphOrder(t.getGlyphOrder() + [name])
    for tb in t['cmap'].tables:
        if tb.isUnicode(): tb.cmap[newcode] = name
make(0x04E9, 0x043E, lambda p: bar(p, 95, 345, 160, 26, 8))      # ө
make(0x04E8, 0x041E, lambda p: bar(p, 150, 840, 330, 34, 12))    # Ө
make(0x04A3, 0x043D, lambda p: tail(p, 370, 20, -120, 30))       # ң
make(0x04A2, 0x041D, lambda p: tail(p, 1300, -120, -300, 40))    # Ң
make(0x04AF, 0x0443, None)                                        # ү
make(0x04AE, 0x0423, None)                                        # Ү
t['maxp'].numGlyphs = len(t.getGlyphOrder())
t.save(dst); print("ok", dst)
