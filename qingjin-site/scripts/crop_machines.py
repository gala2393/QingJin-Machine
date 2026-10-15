"""Crop each machine photo from its brochure half into public/images/machines/<id>.webp.

The blue model badge marks where a product's text column starts; the photo sits on
the other side of the card. Badgeless products fall back to fixed slot bands.
"""
import json
import os
import sys
from PIL import Image, ImageChops, ImageFilter

ROOT = os.path.dirname(os.path.abspath(__file__))
HALVES = os.path.join(ROOT, "work", "halves")
DATA = os.path.join(ROOT, "..", "src", "data", "machines.json")
OUT = os.path.join(ROOT, "..", "public", "images", "machines")
DEBUG = os.path.join(ROOT, "work", "crops_debug.json")

W, H = 1653, 2283
SLOT_BANDS = [(150, 1180), (1180, 2200)]
BG = (244, 245, 249)
# Halves whose badges are too small to detect: photo column (x0, x1) read off the page.
PHOTO_COLUMNS = {
    38: (95, 690), 50: (95, 690), 52: (95, 690), 53: (95, 625), 54: (95, 665),
    55: (95, 690), 58: (95, 740), 60: (880, W - 95), 62: (760, W - 95), 64: (680, W - 95),
}
SINGLE_BOXES = {18: (95, 850, W - 95, 1790)}
# Text shares rows with the photo here, so stray text must be painted out.
MASK_TEXT_HALVES = {60, 61, 62, 63, 64}
# Open transparent lids are nearly white, so their top edge needs a looser test against white.
LOOSE_TOP_HALVES = {56, 57}
# Page-number tabs sit in the bottom corners, where casters can overhang the card.
PAGE_TABS = [(0, 2105, 165, H), (W - 165, 2105, W, H)]
LAST_BOTTOM = 2200


def blue_mask(im):
    r, g, b = [c.point(lambda v: v) for c in im.split()]
    # badge blue is roughly (40-70, 100-140, 200-240)
    rm = r.point(lambda v: 255 if v < 110 else 0)
    gm = g.point(lambda v: 255 if 70 < v < 170 else 0)
    bm = b.point(lambda v: 255 if v > 170 else 0)
    m = ImageChops.multiply(ImageChops.multiply(rm, gm), bm)
    return m.filter(ImageFilter.MaxFilter(11)).filter(ImageFilter.MinFilter(11))


def find_badges(im):
    m = blue_mask(im)
    px = m.load()
    rows = []
    for y in range(0, H, 2):
        run = best = 0
        start = bstart = 0
        for x in range(0, W, 2):
            if px[x, y]:
                if run == 0:
                    start = x
                run += 2
                if run > best:
                    best, bstart = run, start
            else:
                run = 0
        if 200 <= best <= 700:
            rows.append((y, bstart, bstart + best))
    groups = []
    for y, x0, x1 in rows:
        if groups and y - groups[-1]["y1"] <= 6:
            g = groups[-1]
            g["y1"] = y
            g["x0"] = min(g["x0"], x0)
            g["x1"] = max(g["x1"], x1)
        else:
            groups.append({"y0": y, "y1": y, "x0": x0, "x1": x1})
    # real badges are 30-90 px tall
    return [g for g in groups if 24 <= g["y1"] - g["y0"] <= 110]


def pick_badges(groups, n):
    picked = []
    for g in sorted(groups, key=lambda g: g["y0"]):
        if not picked or g["y0"] - picked[-1]["y0"] > 600:
            picked.append(g)
    return picked if len(picked) == n else None


def components(fg):
    """8-connected components of a binary image as (x0, y0, x1, y1, pixels)."""
    w, h = fg.size
    src = fg.tobytes()
    seen = bytearray(w * h)
    out = []
    for start in range(w * h):
        if not src[start] or seen[start]:
            continue
        seen[start] = 1
        stack = [start]
        pixels = []
        x0 = x1 = start % w
        y0 = y1 = start // w
        while stack:
            p = stack.pop()
            pixels.append(p)
            px, py = p % w, p // w
            x0, x1 = min(x0, px), max(x1, px)
            y0, y1 = min(y0, py), max(y1, py)
            for dy in (-1, 0, 1):
                ny = py + dy
                if ny < 0 or ny >= h:
                    continue
                for dx in (-1, 0, 1):
                    nx = px + dx
                    if 0 <= nx < w:
                        q = ny * w + nx
                        if src[q] and not seen[q]:
                            seen[q] = 1
                            stack.append(q)
        out.append((x0, y0, x1, y1, pixels))
    return out


def union(a, b):
    return (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))


def loose_top(region, bb):
    """First half-scale row above bb[1] with visible non-white pixels inside bb's columns."""
    gray = ImageChops.difference(region, Image.new("RGB", region.size, (255, 255, 255))).convert("L")
    small = gray.resize((region.width // 2, region.height // 2), Image.BILINEAR)
    px = small.load()
    def hit(y):
        return sum(1 for x in range(bb[0], bb[2] + 1) if px[x, y] > 20) >= 3

    # Several consecutive rows are required so the thin dashed slot separator is skipped.
    for y in range(0, bb[1]):
        if all(hit(y + k) for k in range(4)):
            return y
    return bb[1]


def trim(im, box, mask_text=False, loose=False):
    region = im.crop(box)
    diff = ImageChops.difference(region, Image.new("RGB", region.size, BG)).convert("L")
    small = diff.resize((region.width // 2, region.height // 2), Image.BILINEAR)
    fg = small.point(lambda v: 255 if v > 30 else 0)
    comps = components(fg)
    # Machines are tall components; text lines, badges and dashed separators are short.
    big = [c for c in comps if c[3] - c[1] >= 50 and c[2] - c[0] >= 30]
    if not big:
        return region
    bb = big[0][:4]
    for c in big[1:]:
        bb = union(bb, c[:4])
    # Bright machine faces barely differ from the card, so their panels and edges show up
    # as small detached pieces; pull in any non-flat piece touching the machine area.
    m = 15
    kept = list(big)
    for c in comps:
        cw, ch = c[2] - c[0], c[3] - c[1]
        # Text-masked halves have spec text right beside the photo, so absorbing is off there;
        # thin vertical or horizontal pieces are card borders, not machine edges.
        if mask_text or c in big or ch < 4 or (cw <= 10 and ch > 60) or (ch <= 10 and cw > 60):
            continue
        if c[2] >= bb[0] - m and c[0] <= bb[2] + m and c[3] >= bb[1] - m and c[1] <= bb[3] + m:
            kept.append(c)
    for c in kept:
        bb = union(bb, c[:4])
    if loose:
        bb = (bb[0], loose_top(region, bb), bb[2], bb[3])
    if mask_text:
        w = fg.width
        buf = bytearray(len(fg.tobytes()))
        for c in kept:
            for p in c[4]:
                buf[p] = 255
        mask = Image.frombytes("L", fg.size, bytes(buf)).filter(ImageFilter.MaxFilter(5))
        mask = mask.resize(region.size, Image.NEAREST).filter(ImageFilter.MaxFilter(7))
        region = Image.composite(region, Image.new("RGB", region.size, (255, 255, 255)), mask)
    pad = 24
    l, t, r, b = (v * 2 for v in bb)
    return region.crop((max(0, l - pad), max(0, t - pad), min(region.width, r + 2 + pad), min(region.height, b + 2 + pad)))


def to_square_canvas(im):
    side = max(im.width, im.height)
    side = int(side * 1.08)
    canvas = Image.new("RGB", (side, side), (255, 255, 255))
    # Flatten gray card backgrounds to white so photos sit cleanly on site cards.
    im = im.point(lambda v: 255 if v > 236 else v)
    # The card's bottom edge is pale blue and merges with casters resting on it.
    px = im.load()
    for y in range(int(im.height * 0.85), im.height):
        for x in range(im.width):
            r, g, b = px[x, y]
            if r > 190 and b - r > 8:
                px[x, y] = (255, 255, 255)
    canvas.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    return canvas


def main(only=None):
    machines = json.load(open(DATA, encoding="utf-8"))
    os.makedirs(OUT, exist_ok=True)
    by_half = {}
    for m in machines:
        by_half.setdefault(m["source"]["half"], []).append(m)
    debug = {}
    for half, items in sorted(by_half.items()):
        if only and half not in only:
            continue
        items.sort(key=lambda m: m["source"]["slot"])
        im = Image.open(os.path.join(HALVES, f"h{half:02d}.jpg")).convert("RGB")
        for tab in PAGE_TABS:
            im.paste(BG, tab)
        badges = pick_badges(find_badges(im), len(items))
        for i, m in enumerate(items):
            band = SLOT_BANDS[i] if len(items) == 2 else (150, LAST_BOTTOM)
            if badges:
                bdg = badges[i]
                top = max(band[0] if i else 250, bdg["y0"] - 110)
                if i + 1 < len(items):
                    bottom = badges[i + 1]["y0"] - 110
                else:
                    bottom = LAST_BOTTOM
                if bdg["x0"] < W * 0.3:
                    box = (760, top, W - 95, bottom)
                else:
                    box = (95, top, bdg["x0"] - 15, bottom)
            elif half in SINGLE_BOXES:
                box = SINGLE_BOXES[half]
            else:
                x0, x1 = PHOTO_COLUMNS.get(half, (50, int(W * 0.48)))
                box = (x0, band[0], x1, band[1])
            crop = to_square_canvas(trim(im, box, half in MASK_TEXT_HALVES, half in LOOSE_TOP_HALVES))
            crop.thumbnail((900, 900), Image.LANCZOS)
            crop.save(os.path.join(OUT, m["id"] + ".webp"), "WEBP", quality=84, method=6)
            debug[m["id"]] = {"half": half, "box": box, "badge": bool(badges)}
    json.dump(debug, open(DEBUG, "w"), indent=1)
    print(f"{len(debug)} crops, {sum(1 for d in debug.values() if not d['badge'])} without badge")


if __name__ == "__main__":
    main({int(a) for a in sys.argv[1:]} or None)
