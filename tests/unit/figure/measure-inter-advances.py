"""Measures the real advance widths of Inter, the site font, for tests/unit/figure/label-width.test.ts.

Writes tests/unit/figure/inter-advances.json: the font file's SHA-256, its ascent and descent (in em,
the height of a text box in every engine), the widest advance of every
character the site's font file holds (in em, over 13 px regular with and without tabular figures and
15 px semibold), and the shaped width (in em, with kerning) of every chart label string the site renders.

Run from the repository root:
  uvx --with uharfbuzz==0.51.1 --from 'fonttools[woff]==4.67.0' python -I tests/unit/figure/measure-inter-advances.py
"""
import hashlib, io, json, pathlib
import uharfbuzz as hb
from fontTools.ttLib import TTFont

FONT = pathlib.Path('src/app/fonts/InterVariable-latin.woff2')
OUT = pathlib.Path('tests/unit/figure/inter-advances.json')

# The chart text styles: tick labels are 13 px with tabular figures ([data-num]), the zero-line words
# 13 px regular, annotations 15 px semibold. opsz follows the size (font-optical-sizing: auto, min 14).
STYLES = {
    'tick': ({'wght': 400, 'opsz': 14}, {'cv05': True, 'tnum': True}),
    'word': ({'wght': 400, 'opsz': 14}, {'cv05': True}),
    'note': ({'wght': 600, 'opsz': 15}, {'cv05': True}),
}

# Every character the font maps that content uses (the font-file test's list): printable ASCII plus symbols.
CHARS = [chr(c) for c in range(0x20, 0x7F)] + list(' ×αβ–’…₀₁₂₋−√≈≤≥€£')

# The chart label strings the site renders (zero-line words, tick labels, annotations), with their style.
STRINGS = {
    'word': ['no difference', 'no ', 'difference', 'B higher', 'B lower', 'no change', 'no', 'change', 'higher', 'lower'],
    'tick': ['0', '−20', '−10', '−5', '+5', '+10', '+20', '+40', '−0.5', '+0.3', '0.0', '1.0', '0%', '25%', '50%', '100%',
             '0.02', '0.1', '1', '10', '50', '1,000', '600,000', '9,400,000', '£1,234', 'Session completion', 'Help requests',
             'Before the tool', 'With the tool', 'Jan 2010', 'Dec 2011', 'Sep 2011', 'May 2011', 'Mar 2011', 'Group A', 'Group B'],
    'note': ['Limit +1.0', 'Limit −1.0', 'Limit +2.0', 'Partial month', 'Dotted line: nominal 5%', 'Dec 2010 cohort',
             'May 2011 cohort', 'The interval narrows', 'The interval narrows as views grow', 'The estimate settles',
             '1,234 per group', '12,345 per group for a rise of 5 points'],
}

data = FONT.read_bytes()
ttf = io.BytesIO()
font = TTFont(io.BytesIO(data)); font.flavor = None; font.save(ttf)
face = hb.Face(hb.Blob(ttf.getvalue()))
upem = face.upem

def width(text, style):
    variations, features = STYLES[style]
    f = hb.Font(face); f.set_variations(variations)
    buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties()
    hb.shape(f, buf, features)
    return sum(p.x_advance for p in buf.glyph_positions) / upem

out = {
    'font': str(FONT),
    'sha256': hashlib.sha256(data).hexdigest(),
    'ascent': round(font['hhea'].ascent / upem, 4),
    'descent': round(-font['hhea'].descent / upem, 4),
    'glyphs': {c: round(max(width(c, s) for s in STYLES), 4) for c in CHARS},
    'strings': {s: {t: round(width(t, s), 4) for t in texts} for s, texts in STRINGS.items()},
}
OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n')
print(f'wrote {OUT}: {len(out["glyphs"])} glyphs, {sum(len(v) for v in out["strings"].values())} strings')
