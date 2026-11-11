"""Crop each machine photo from its 画册156 page into public/images/machines/<id>.webp.

Each page shows one machine as a cut-out on white, usually next to spec text and sample
photos. The search area is the band below the title and above the blue "product display"
strip. The largest non-white blob in it is the machine; everything outside that blob is
painted white before cropping, so neighbouring text and pictures cannot leak into the crop.

Pages the detector gets wrong are fixed in scripts/work156/crop_boxes.json, keyed by machine
id or page number: {"box": [x0, y0, x1, y1]} limits the search to that area (fractions of the
half page); adding "plain": true crops exactly that box without the blob filter.

Usage: py scripts\\crop_machines_156.py [page ...]   (no args = all machines)
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter

Image.MAX_IMAGE_PIXELS = None

ROOT = Path(__file__).resolve().parent
HALVES = ROOT / "work156" / "halves"
DATA = ROOT.parent / "src" / "data" / "machines.json"
OUT = ROOT.parent / "public" / "images" / "machines"
DEBUG = ROOT / "work156" / "crops_debug"
OVERRIDES = ROOT / "work156" / "crop_boxes.json"

# Detection runs at this width; the crop is cut from the full-size half page.
SCALE_W = 620
MARGIN_PX = 6


def blue_strip_top(small):
    """First row of the saturated-blue product-display strip near the page bottom, or None."""
    w, h = small.size
    px = small.load()
    for y in range(int(h * 0.55), h):
        blue = sum(1 for x in range(0, w, 6) if px[x, y][2] > 150 and px[x, y][0] < 90 and px[x, y][1] < 140)
        if blue > (w / 6) * 0.6:
            return y
    return None


def largest_blob(mask):
    """Pixels of the largest 4-connected blob in a binary 'L' image, as (bytearray, bbox)."""
    w, h = mask.size
    data = mask.tobytes()
    seen = bytearray(w * h)
    best = None
    for start in range(w * h):
        if not data[start] or seen[start]:
            continue
        seen[start] = 1
        stack = [start]
        members = []
        x0 = x1 = start % w
        y0 = y1 = start // w
        while stack:
            p = stack.pop()
            members.append(p)
            px_, py_ = p % w, p // w
            x0, x1 = min(x0, px_), max(x1, px_)
            y0, y1 = min(y0, py_), max(y1, py_)
            if px_ > 0 and data[p - 1] and not seen[p - 1]:
                seen[p - 1] = 1
                stack.append(p - 1)
            if px_ < w - 1 and data[p + 1] and not seen[p + 1]:
                seen[p + 1] = 1
                stack.append(p + 1)
            if py_ > 0 and data[p - w] and not seen[p - w]:
                seen[p - w] = 1
                stack.append(p - w)
            if py_ < h - 1 and data[p + w] and not seen[p + w]:
                seen[p + w] = 1
                stack.append(p + w)
        if x1 - x0 + 1 < w * 0.08 or y1 - y0 + 1 < h * 0.1:
            continue
        if best is None or len(members) > len(best[0]):
            best = (members, (x0, y0, x1, y1))
    if not best:
        return None
    body = bytearray(w * h)
    for p in best[0]:
        body[p] = 255
    return body, best[1]


def detect(im, area=None):
    """Return (box, body_mask) as fractions of the half page, or None."""
    full_w, full_h = im.size
    k = SCALE_W / full_w
    small = im.resize((SCALE_W, round(full_h * k)), Image.BILINEAR)
    w, h = small.size
    if area:
        left, top, right, bottom = (round(area[0] * w), round(area[1] * h), round(area[2] * w), round(area[3] * h))
    else:
        left, right = 0, w
        top = int(h * 0.17)
        bottom = blue_strip_top(small) or int(h * 0.93)
    region = small.crop((left, top, right, bottom))
    diff = ImageChops.difference(region, Image.new("RGB", region.size, (255, 255, 255))).convert("L")
    # A small dilation closes gaps inside the machine but keeps nearby caption lines apart.
    ink = diff.point(lambda v: 255 if v > 28 else 0).filter(ImageFilter.MaxFilter(3))
    found = largest_blob(ink)
    if not found:
        return None
    body, (x0, y0, x1, y1) = found
    mask = Image.frombytes("L", ink.size, bytes(body))
    # Grow the body a little so soft anti-aliased edges and shadows survive.
    mask = mask.filter(ImageFilter.MaxFilter(9))
    full = Image.new("L", (w, h), 0)
    full.paste(mask, (left, top))
    box = (
        max(0, (left + x0 - MARGIN_PX) / w),
        max(0, (top + y0 - MARGIN_PX) / h),
        min(1, (left + x1 + MARGIN_PX) / w),
        min(1, (top + y1 + MARGIN_PX) / h),
    )
    return box, full


def to_square(im):
    side = int(max(im.size) * 1.08)
    canvas = Image.new("RGB", (side, side), (255, 255, 255))
    canvas.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    return canvas


def crop_page(im, area=None, plain=False):
    if plain and area:
        # Bright, highlight-heavy machines split into several blobs; the box alone is reliable.
        w, h = im.size
        crop = im.crop((round(area[0] * w), round(area[1] * h), round(area[2] * w), round(area[3] * h)))
        return to_square(crop), tuple(area)
    found = detect(im, area)
    if not found:
        return None, None
    box, mask = found
    w, h = im.size
    mask = mask.resize((w, h), Image.BILINEAR).filter(ImageFilter.GaussianBlur(2))
    clean = Image.composite(im, Image.new("RGB", im.size, (255, 255, 255)), mask)
    crop = clean.crop((round(box[0] * w), round(box[1] * h), round(box[2] * w), round(box[3] * h)))
    return to_square(crop), box


def main(only=None):
    machines = json.loads(DATA.read_text(encoding="utf-8"))
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8")) if OVERRIDES.exists() else {}
    OUT.mkdir(parents=True, exist_ok=True)
    DEBUG.mkdir(parents=True, exist_ok=True)
    report = {}
    for m in machines:
        page = m["source"]["page"]
        if only and page not in only:
            continue
        im = Image.open(HALVES / f"pg{page:03d}.jpg").convert("RGB")
        rule = overrides.get(m["id"]) or overrides.get(str(page)) or {}
        sq, box = crop_page(im, rule.get("box"), rule.get("plain", False))
        if sq is None:
            report[m["id"]] = {"page": page, "how": "FAILED"}
            continue
        sq.thumbnail((900, 900), Image.LANCZOS)
        sq.save(OUT / f"{m['id']}.webp", "WEBP", quality=84, method=6)
        report[m["id"]] = {"page": page, "box": [round(v, 3) for v in box], "how": "override" if rule else "auto"}
    (DEBUG / "report.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    failed = [k for k, v in report.items() if v["how"] == "FAILED"]
    print(f"{len(report)} crops, {len(failed)} failed: {failed}")


if __name__ == "__main__":
    main({int(a) for a in sys.argv[1:]} or None)
