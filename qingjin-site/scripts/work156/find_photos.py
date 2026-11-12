"""Find photo rectangles on a half page: large blocks of textured / non-white pixels.

Usage: python find_photos.py <page> [y0 y1] [min_w min_h]   (fractions; prints boxes as fractions)
A pixel is 'ink' when it is not near-white; ink is dilated so a photo's pale highlights stay
joined, then connected blocks bigger than min_w x min_h (fractions of the page) are reported.
Text lines are too short to pass min_h, so captions drop out.
"""
import sys
from pathlib import Path

from PIL import Image, ImageFilter

Image.MAX_IMAGE_PIXELS = None
HALVES = Path(__file__).resolve().parent / "halves"


def photos(page, y0=0.0, y1=1.0, min_w=0.10, min_h=0.05, scale_w=400):
    im = Image.open(HALVES / f"pg{page:03d}.jpg").convert("L")
    small = im.resize((scale_w, round(im.height * scale_w / im.width)))
    w, h = small.size
    mask = small.point(lambda v: 255 if v < 235 else 0)
    mask = mask.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.MinFilter(5))
    data = bytearray(mask.tobytes())
    seen = bytearray(w * h)
    out = []
    for s in range(int(y0 * h) * w, int(y1 * h) * w):
        if not data[s] or seen[s]:
            continue
        stack = [s]
        seen[s] = 1
        xs0 = xs1 = s % w
        ys0 = ys1 = s // w
        n = 0
        while stack:
            p = stack.pop()
            n += 1
            x, y = p % w, p // w
            xs0, xs1, ys0, ys1 = min(xs0, x), max(xs1, x), min(ys0, y), max(ys1, y)
            for q in (p - 1 if x > 0 else -1, p + 1 if x < w - 1 else -1, p - w if y > 0 else -1, p + w if y < h - 1 else -1):
                if q >= 0 and data[q] and not seen[q] and int(y0 * h) <= q // w < int(y1 * h):
                    seen[q] = 1
                    stack.append(q)
        bw, bh = (xs1 - xs0 + 1) / w, (ys1 - ys0 + 1) / h
        fill = n / ((xs1 - xs0 + 1) * (ys1 - ys0 + 1))
        if bw >= min_w and bh >= min_h and fill > 0.55:
            out.append((round(xs0 / w, 3), round(ys0 / h, 3), round((xs1 + 1) / w, 3), round((ys1 + 1) / h, 3)))
    return sorted(out, key=lambda b: (round(b[1], 1), b[0]))


if __name__ == "__main__":
    a = sys.argv[1:]
    pg = int(a[0])
    y0 = float(a[1]) if len(a) > 1 else 0.0
    y1 = float(a[2]) if len(a) > 2 else 1.0
    mw = float(a[3]) if len(a) > 3 else 0.10
    mh = float(a[4]) if len(a) > 4 else 0.05
    for b in photos(pg, y0, y1, mw, mh):
        print(b)
