"""Append/replace picture-group boxes in section_specs.json.

Usage: python addspec.py 6a:0.07,0.555,0.35,0.77;0.36,0.555,0.64,0.77  7a:0.08,0.72,0.49,0.93 ...
Each argument is <page><group>:<box>;<box>;... (fractions of the half page).
"""
import json
import re
import sys
from pathlib import Path

P = Path(__file__).resolve().parent / "section_specs.json"
groups = json.loads(P.read_text(encoding="utf-8"))
for arg in sys.argv[1:]:
    key, boxes = arg.split(":")
    m = re.fullmatch(r"(\d+)([a-z])", key)
    page, grp = int(m.group(1)), m.group(2)
    tiles = [[float(v) for v in b.split(",")] for b in boxes.split(";")]
    groups = [g for g in groups if not (g["page"] == page and g["group"] == grp)]
    groups.append({"page": page, "group": grp, "tiles": tiles})
groups.sort(key=lambda g: (g["page"], g["group"]))
P.write_text(json.dumps(groups, ensure_ascii=False, indent=1), encoding="utf-8")
print(len(groups), "groups")
