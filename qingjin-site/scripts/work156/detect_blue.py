"""Detect the tiles inside the blue product-display / options band at the bottom of a half page.

Usage: python detect_blue.py <page> [<page> ...]  -> prints '<page>: n tiles' and writes
work156/tmp/blue_tiles_all.json  {page: [[x0,y0,x1,y1], ...]} (fractions of the half page).
Tiles are the non-blue blocks between the band's left and right edge; the band must span most of
the page width, otherwise the page is reported as 'no band'.
"""
import json
import sys
from pathlib import Path

from PIL import Image

Image.MAX_IMAGE_PIXELS = None
HERE = Path(__file__).resolve().parent


def is_blue(px):
    r, g, b = px[:3]
    return b > 120 and r < 80 and g < 120 and b - r > 70


def band(page):
    full = Image.open(HERE / "halves" / f"pg{page:03d}.jpg").convert("RGB")
    sw = 620
    sm = full.resize((sw, round(full.height * sw / full.width)))
    w, h = sm.size
    px = sm.load()
    # band rows: many blue pixels across the page
    rows = [sum(1 for x in range(0, w, 4) if is_blue(px[x, y])) / (w / 4) for y in range(h)]
    ys = [y for y in range(int(h * 0.6), h) if rows[y] > 0.25]
    if not ys:
        return None
    y0, y1 = max(ys[0], int(h * 0.7)), ys[-1]
    # The band's heading ("成品展示 Product Display") sits in the top-left corner and is not blue: start below it.
    y0 += max(4, round(h * 0.035))
    x0, x1 = int(0.03 * w), int(0.97 * w)
    col = [sum(1 for y in range(y0, y1, 2) if not is_blue(px[x, y])) for x in range(x0, x1)]
    thr = max(6, (y1 - y0) // 2 * 0.12)
    runs, s = [], None
    for i, c in enumerate(col + [0]):
        if c >= thr and s is None:
            s = i
        elif c < thr and s is not None:
            if i - s >= w * 0.05:
                runs.append((s + x0, i + x0))
            s = None
    tiles = []
    for a, b in runs:
        rr = [sum(1 for x in range(a, b, 2) if not is_blue(px[x, y])) for y in range(y0, y1)]
        yy = [y0 + i for i, c in enumerate(rr) if c >= (b - a) / 2 * 0.25]
        if yy:
            tiles.append([round((a + 2) / w, 4), round((yy[0] + 2) / h, 4), round((b - 2) / w, 4), round((yy[-1] - 1) / h, 4)])
    return tiles


if __name__ == "__main__":
    out = {}
    for pg in map(int, sys.argv[1:]):
        t = band(pg)
        print(f"{pg}: {'no band' if t is None else str(len(t)) + ' tiles'}")
        if t:
            out[pg] = t
    (HERE / "tmp" / "blue_tiles_all.json").write_text(json.dumps(out), encoding="utf-8")
