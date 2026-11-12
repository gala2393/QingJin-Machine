"""Contact sheet of the tiles in tmp/blue_tiles_all.json for the given pages (no files written to public).

Usage: python blue_sheet.py out.jpg <page> [<page> ...]
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

Image.MAX_IMAGE_PIXELS = None
HERE = Path(__file__).resolve().parent
tiles = json.loads((HERE / "tmp" / "blue_tiles_all.json").read_text(encoding="utf-8"))
out = sys.argv[1]
rows = []
for pg in map(str, sys.argv[2:]):
    full = Image.open(HERE / "halves" / f"pg{int(pg):03d}.jpg").convert("RGB")
    W, H = full.size
    parts = []
    for a, b, c, d in tiles[pg]:
        im = full.crop((round(a * W), round(b * H), round(c * W), round(d * H)))
        parts.append(im.resize((max(1, round(im.width * 150 / im.height)), 150)))
    row = Image.new("RGB", (sum(p.width for p in parts) + 6 * (len(parts) + 1) + 40, 160), "white")
    ImageDraw.Draw(row).text((2, 70), f"p{pg}", fill=(200, 0, 0))
    x = 40
    for p in parts:
        row.paste(p, (x, 5))
        x += p.width + 6
    rows.append(row)
sheet = Image.new("RGB", (max(r.width for r in rows), sum(r.height for r in rows)), "white")
y = 0
for r in rows:
    sheet.paste(r, (0, y))
    y += r.height
sheet.save(out, quality=78)
