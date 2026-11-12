"""Blue-band picture groups of batch 2: page -> (kind, [(zh, en), ...] captions or None for no captions).

Captions are the text printed under each tile on the brochure page (read from the contact sheets);
kind is the heading of the band. `apply()` writes the detected boxes into section_specs.json and
returns the SECTION_GROUPS entries for merge_data_156.py.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent

RIBBON = ("色带打码机", "Ribbon Printer")
RIBBON2 = ("色带打码机", "Ribbon coding machine")
CURSOR = ("光标", "Cursor")
BELT = ("传送带", "Conveyor belt")
MOTOR = ("普通拉膜电机", "Film pulling motor")
PLC = ("PLC触控屏电脑版", "PLC touch screen")
KEYPAD = ("按键款电脑板", "Keypad control panel")
FEED = ("上料机", "Feeding machine")

GROUPS = {
    # 可选配置
    46: ("options", [RIBBON, CURSOR, FEED, BELT]),
    48: ("options", [RIBBON, CURSOR, ("加充氮气接口", "Add nitrogen gas flushing"), BELT]),
    52: ("options", [RIBBON2, CURSOR, ("加大料斗", "Replace the storage hopper"), BELT]),
    61: ("options", [RIBBON, CURSOR, ("加搅拌器", "Blender"), BELT]),
    70: ("options", [RIBBON, CURSOR, FEED, BELT]),
    73: ("options", [("粉末上料机", "Screw Feeding Machine"), ("Z型上料机", "Z-type feeding machine"), FEED, BELT]),
    76: ("options", [RIBBON, CURSOR, ("定制304材质", "Customized 304 material"), BELT]),
    80: ("options", [RIBBON, CURSOR, BELT]),
    93: ("options", [("物料平台", "Material platform"), ("圆筒翻领", "Cylindrical lapel"), ("平行输送带", "Parallel conveyor belt"), ("红外感应/脚踏板", "Infrared sensing/foot pedal")]),
    108: ("options", [RIBBON2, CURSOR, BELT, MOTOR]),
    110: ("options", [RIBBON2, CURSOR, BELT, MOTOR]),
    113: ("options", [RIBBON2, CURSOR, PLC, MOTOR]),
    115: ("options", [("PLC触控屏电脑版", "PLC control panel"), ("铝支架数拉膜电机", "Aluminum bracket pull film motor"), MOTOR]),
    122: ("options", [("加搅拌器", "Vertical mixer"), ("加压桶", "Pressurized lid"), ("保温桶", "Insulated hopper"), KEYPAD]),
    125: ("options", [("加搅拌器", "Vertical mixer"), RIBBON2, CURSOR, ("按键款电脑版", "Keypad control panel")]),
    129: ("options", [RIBBON2, CURSOR, BELT]),
    # 支持定制
    63: ("custom", [("加真空功能", "Add vacuum function"), ("加充氮气", "Add nitrogen gas"), ("加封口挂孔", "Add hanging holes"), ("加排气孔", "Add exhaust holes")]),
}
# 成品展示: tiles carry no printed caption.
SHOWCASE = [47, 51, 53, 54, 55, 57, 58, 60, 62, 64, 65, 66, 67, 71, 72, 74, 75, 77, 78, 79, 81, 82, 91, 95, 97,
            105, 106, 107, 109, 111, 112, 114, 119, 120, 121, 123, 126, 127, 130]
# Skipped on purpose: 75 (first tile is page text), 87-90 (mixed counting-plate / bag tiles, no heading).
DROP_FIRST = {75}


def apply():
    tiles = json.loads((HERE / "tmp" / "blue_tiles_all.json").read_text(encoding="utf-8"))
    specs_path = HERE / "section_specs.json"
    specs = [g for g in json.loads(specs_path.read_text(encoding="utf-8")) if g["page"] < 40 or g["page"] in (44, 45) or g["page"] in (39, 41, 42, 43)]
    groups = {}
    pages = {**{p: GROUPS[p] for p in GROUPS}, **{p: ("showcase", None) for p in SHOWCASE}}
    for pg, (kind, caps) in sorted(pages.items()):
        t = tiles[str(pg)][1:] if pg in DROP_FIRST else tiles[str(pg)]
        if caps is not None and len(caps) != len(t):
            raise SystemExit(f"p{pg}: {len(t)} tiles but {len(caps)} captions")
        specs = [g for g in specs if not (g["page"] == pg and g["group"] == "a")]
        specs.append({"page": pg, "group": "a", "tiles": t})
        groups[pg] = (kind, caps if caps is not None else [None] * len(t))
    specs.sort(key=lambda g: (g["page"], g["group"]))
    specs_path.write_text(json.dumps(specs, ensure_ascii=False, indent=1), encoding="utf-8")
    return groups


if __name__ == "__main__":
    g = apply()
    print(len(g), "pages")

