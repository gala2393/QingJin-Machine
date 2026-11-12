"""Cut the picture groups (成品展示 / 可选配置 / 可搭配其它设备 / 支持非标定制 / 定制案例 / 细节展示)
out of the 画册156 half pages as public/images/machines/sec-p<页>-<组>-<序号>.webp.

Spec file: scripts/work156/section_specs.json, a list of groups:
  {"page": 3, "group": "a", "tiles": [[x0, y0, x1, y1], ...]}
Boxes are fractions of the half page (pgNNN.jpg), measured on the grid sheets, so every crop
is hand-checked rather than auto-detected. Captions and the models that share a group live in
merge_data_156.py (SECTION_GROUPS), which reads the same page/group keys.

Usage: py scripts\\crop_sections_156.py [page ...]
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

Image.MAX_IMAGE_PIXELS = None

ROOT = Path(__file__).resolve().parent
HALVES = ROOT / "work156" / "halves"
SPECS = ROOT / "work156" / "section_specs.json"
OUT = ROOT.parent / "public" / "images" / "machines"
PREVIEW = ROOT / "work156" / "tmp"
MAX_W = 900


def main():
    groups = json.loads(SPECS.read_text(encoding="utf-8"))
    only = {int(a) for a in sys.argv[1:]}
    OUT.mkdir(parents=True, exist_ok=True)
    PREVIEW.mkdir(parents=True, exist_ok=True)
    for g in groups:
        if only and g["page"] not in only:
            continue
        full = Image.open(HALVES / f"pg{g['page']:03d}.jpg").convert("RGB")
        W, H = full.size
        crops = []
        for i, (a, b, c, d) in enumerate(g["tiles"], 1):
            im = full.crop((round(a * W), round(b * H), round(c * W), round(d * H)))
            if im.width > MAX_W:
                im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
            im.save(OUT / f"sec-p{g['page']:03d}-{g['group']}-{i}.webp", "WEBP", quality=82, method=6)
            crops.append(im)
        sh = 200
        parts = [c.resize((max(1, round(c.width * sh / c.height)), sh)) for c in crops]
        sheet = Image.new("RGB", (sum(p.width for p in parts) + 8 * (len(parts) + 1), sh + 30), "white")
        x = 8
        for p in parts:
            sheet.paste(p, (x, 22))
            x += p.width + 8
        ImageDraw.Draw(sheet).text((8, 4), f"p{g['page']}{g['group']}", fill=(200, 0, 0))
        sheet.save(PREVIEW / f"sec_p{g['page']:03d}{g['group']}.jpg", quality=80)
        print(f"p{g['page']}{g['group']}: {len(crops)} tiles")


if __name__ == "__main__":
    main()
