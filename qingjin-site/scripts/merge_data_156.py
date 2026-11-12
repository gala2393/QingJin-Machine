"""Merge scripts/work156/data/part_*.json (transcribed from 画册156.pdf) into src/data/machines.json + categories.json.

Machine photos are produced separately by crop_machines_156.py; this script only records the
image paths those crops will use.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "work156" / "data"
OUT = ROOT.parent / "src" / "data"

# Display order on the site.
CATEGORIES = [
    ("desktop", "台式分装机", "Desktop Filling Machines"),
    ("large-filling", "大定量分装机", "Large Quantity Filling Machines"),
    ("auger-filling", "螺杆与灌装分装机", "Auger & Cup Filling Machines"),
    ("packaging", "颗粒粉末包装机", "Granule & Powder Packaging Machines"),
    ("feeder-conveyor", "上料机与输送带", "Feeders & Conveyors"),
    ("liquid", "液体包装机", "Liquid Packaging Machines"),
    ("paste", "膏体包装机", "Paste Packaging Machines"),
    ("premade-bag", "给袋式包装机", "Pre-made Bag Packaging Machines"),
    ("vacuum", "真空机", "Vacuum Machines"),
]

# Page-specific corrections that the brochure itself gets wrong (see 画册问题清单-156.md).
MODEL_FIXES = {
    (154, "DZ-680"): "MZ-680",
}
NAME_EN_FIXES = {
    (146, "DZ-620"): lambda s: s.replace("DZ-560", "DZ-620"),
}
# p76/77/83/84/85 print one model number over a 2-3 column spec table. The extra columns are
# transcribed from the brochure notes; each value is "col1 / col2 / col3" like the other
# multi-tier pages. Columns where a cell is blank are left out of that parameter, so dimension
# and weight rows only list the tiers that actually print them.
TIERS = {
    "QB-LB100": {
        "filling_range": ("3-100g / 10-200g", "3-100g / 10-200g"),
        "packaging_speed": ("30-60bags/min / 25-50bags/min", "30-60bags/min / 25-50bags/min"),
        "accuracy": ("±1g / ±1-3g(因物料而异)", "±1g / ±1-3g"),
        "film_width": ("5-20cm / 20-34cm", "5-20cm / 20-34cm"),
        "bag_length": ("3-16cm / 3-22cm", "3-16cm / 3-22cm"),
        "voltage_power": ("220V/600W", "220V/600W"),
        "dimensions": ("61x97x168cm", "61x97x168cm"),
        "weight": ("- / 112kg", "- / 112kg"),
    },
    "DB-LB100": {
        "filling_range": ("3-100g / 10-200g", "3-100g / 10-200g"),
        "packaging_speed": ("45-60bags/min / 35-55bags/min", "45-60bags/min / 35-55bags/min"),
        "accuracy": ("±1g / ±1-3g(因物料而异)", "±1g / ±1-3g"),
        "film_width": ("5-20cm / 20-32cm", "5-20cm / 20-32cm"),
        "bag_length": ("3-16cm / 3-22cm", "3-16cm / 3-22cm"),
        "voltage_power": ("2.2KW", "2.2KW"),
        "dimensions": ("76x97x200cm", "76x97x200cm"),
        "weight": ("238kg", "238kg"),
    },
    "QS-ZT50": {
        "filling_range": ("5-50g / 20-200g / 50-500g", "5-50g / 20-200g / 50-500g"),
        "packaging_speed": ("25-40bags/min / 20-35bags/min / 10-20bags/min", "25-40bags/min / 20-35bags/min / 10-20bags/min"),
        "accuracy": ("±0.2-1g / ±2g / ±3g(因物料而异)", "±0.2-1g / ±2g / ±3g"),
        "film_width": ("5-20cm / 20-34cm / 30-44cm", "5-20cm / 20-34cm / 30-44cm"),
        "bag_length": ("3-16cm / 3-22cm / 3-27cm", "3-16cm / 3-22cm / 3-27cm"),
        "voltage_power": ("220V/1200W / 220V/1300W / 220V/1800W", "220V/1200W / 220V/1300W / 220V/1800W"),
        "dimensions": ("70x111x158cm / 71x117x158cm / -", "70x111x158cm / 71x117x158cm / -"),
        "weight": ("102kg / 105kg / -", "102kg / 105kg / -"),
    },
    "QS-ZLG50": {
        "filling_range": ("1-50g / 50-500g / 100-1000g", "1-50g / 50-500g / 100-1000g"),
        "packaging_speed": ("25-40bags/min / 15-30bags/min / 10-20bags/min", "25-40bags/min / 15-30bags/min / 10-20bags/min"),
        "accuracy": ("±0.2-1g / ±2g / ±3g(因物料而异)", "±0.2-1g / ±2g / ±3g"),
        "hopper_capacity": ("15L", "15L"),
        "film_width": ("5-20cm / 20-34cm / 30-44cm", "5-20cm / 20-34cm / 30-44cm"),
        "bag_length": ("3-16cm / 3-22cm / 3-27cm", "3-16cm / 3-22cm / 3-27cm"),
        "voltage_power": ("220V/1200W / 220V/1600W / 220V/1800W", "220V/1200W / 220V/1600W / 220V/1800W"),
    },
    "QB-Z500": {
        "filling_range": ("1-100g / 50-500g / 100-1000g", "1-100g / 50-500g / 100-1000g"),
        "packaging_speed": ("25-40bags/min / 15-30bags/min / 10-20bags/min", "25-40bags/min / 15-30bags/min / 10-20bags/min"),
        "accuracy": ("±0.2-1g / ±2g / ±3g(因物料而异)", "±0.2-1g / ±2g / ±3g"),
        "hopper_capacity": ("15L / 15L / 30L", "15L / 15L / 30L"),
        "film_width": ("5-20cm / 20-34cm / 30-44cm", "5-20cm / 20-34cm / 30-44cm"),
        "bag_length": ("3-16cm / 3-22cm / 3-27cm", "3-16cm / 3-22cm / 3-27cm"),
        "voltage_power": ("220V/1200W / 220V/1600W / 220V/1800W", "220V/1200W / 220V/1600W / 220V/1800W"),
        "dimensions": ("- / 81x127x210cm / 90x127x210cm", "- / 81x127x210cm / 90x127x210cm"),
        "weight": ("- / 203kg / -", "- / 203kg / -"),
    },
}

# Column 1 prints "三边封/背封" and the later columns 背封 only.
SEALING_TIERS = {
    "QS-ZT50": ("三边封/背封 / 背封 / 背封", "3-side seal/Back seal / Back Seal / Back Seal"),
    "QS-ZLG50": ("三边封/背封 / 背封 / 背封", "3-side seal/Back seal / Back Seal / Back Seal"),
    "QB-Z500": ("三边封/背封 / 背封 / 背封", "3-side seal/Back seal / Back Seal / Back Seal"),
}
# Entries that are not machines.
SKIP_MODELS = {"ACCESSORY-CODER"}
# Same model printed on two different machines: distinguish by page.
DUPLICATE_BY_PAGE = {"DB-500"}


def slugify(s):
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s or "item"


PARAM_LABELS = {
    "voltage_power": ("电压功率", "Voltage / Power"),
    "dimensions": ("整机尺寸", "Size/L*W*H"),
    "weight": ("整机重量", "Weight"),
}


def apply_tiers(machine, model):
    """Replace single-column values with the multi-tier ones; append rows the first column lacks."""
    tiers = dict(TIERS.get(model, {}))
    if model in SEALING_TIERS:
        tiers["sealing_style"] = SEALING_TIERS[model]
    if not tiers:
        return
    by_key = {p["key"]: p for p in machine["params"]}
    for key, (zh, en) in tiers.items():
        if key in by_key:
            by_key[key]["value_zh"], by_key[key]["value_en"] = zh, en
        else:
            label_zh, label_en = PARAM_LABELS[key]
            machine["params"].append({"key": key, "zh": label_zh, "en": label_en, "value_zh": zh, "value_en": en})


# Heading wording differs per page; checked against every page image of 画册156.pdf.
FEATURE_PAGES = {51, 79, 83, 93, 101, 102, 103, 115, 116, 117, 137, 138, 140, 141, 151, 153}
# These pages print a "Vacuum capacity" block (bags per cycle) instead of advantages.
VACUUM_CAPACITY_PAGES = {154, 155, 156}
# Only these two pages print three separate icon bullets; everywhere else the text is one paragraph.
SPLIT_ADVANTAGE_PAGES = {3, 5}

TITLES = {
    "advantages": ({"zh": "产品优势", "en": "Product Advantages"}),
    "features": ({"zh": "产品特性", "en": "Product Features"}),
    "application": ({"zh": "适用产品", "en": "Applications"}),
    "capacity": ({"zh": "真空数量", "en": "Vacuum Capacity"}),
}


def _split(text, sep):
    return [p.strip() for p in text.split(sep) if p.strip()]


def build_sections(it):
    """Text blocks transcribed from the brochure page: advantages/features, vacuum capacity, applications."""
    page = it["page"]
    zh, en = (it.get("advantages_zh") or "").strip(), (it.get("advantages_en") or "").strip()
    sections = []
    if zh or en:
        if page in VACUUM_CAPACITY_PAGES:
            items = _split(zh, ";")
            en_items = [s.strip() for s in re.split(r"(?<=at once);|\.\s+(?=Also)", en) if s.strip()]
            en_items = [s.rstrip(".") for s in en_items]
            if len(items) != len(en_items):
                raise SystemExit(f"vacuum capacity lines differ on page {page}: {len(items)} vs {len(en_items)}")
            sections.append({"kind": "text", "title": TITLES["capacity"], "items": [{"zh": a, "en": b} for a, b in zip(items, en_items)]})
        else:
            capacity = None
            if page == 153:
                # The two "bags at once" lines are the vacuum capacity; the paragraph before them is the feature text.
                zh_main, zh_cap = zh.split("大米0.5kg", 1)
                en_main, en_cap = en.split("Rice Bags", 1)
                caps_zh = _split("大米0.5kg" + zh_cap, ";")
                caps_en = _split("Rice Bags" + en_cap, ";")
                if len(caps_zh) != len(caps_en):
                    raise SystemExit("page 153 capacity lines differ")
                zh, en = zh_main.strip(), en_main.strip()
                capacity = {"kind": "text", "title": TITLES["capacity"], "items": [{"zh": a, "en": b} for a, b in zip(caps_zh, caps_en)]}
            lines = []
            if page in SPLIT_ADVANTAGE_PAGES:
                zs, es = _split(zh, " / "), _split(en, " / ")
                if len(zs) != len(es):
                    raise SystemExit(f"advantage bullets differ on page {page}")
                lines = [{"zh": a, "en": b} for a, b in zip(zs, es)]
            else:
                lines = [{"zh": zh, "en": en}]
            key = "features" if page in FEATURE_PAGES else "advantages"
            sections.append({"kind": "text", "title": TITLES[key], "items": lines})
            if capacity:
                sections.append(capacity)
    app_zh, app_en = (it.get("application_zh") or "").strip(), (it.get("application_en") or "").strip()
    if app_zh or app_en:
        sections.append({"kind": "text", "title": TITLES["application"], "items": [{"zh": app_zh, "en": app_en}]})
    return sections


GALLERY_TITLES = {
    "showcase": {"zh": "成品展示", "en": "Finished Product Display"},
    "options": {"zh": "可选配置", "en": "Optional Configurations"},
    "pair": {"zh": "可搭配其它设备使用", "en": "Can Be Used With Other Equipment"},
    "custom": {"zh": "支持非标定制", "en": "Non-standard Customization Supported"},
    "case": {"zh": "定制案例", "en": "Custom Solutions"},
    "detail": {"zh": "细节展示", "en": "Detail Display"},
}


def _caps(*pairs):
    return [{"zh": z, "en": e} for z, e in pairs]


NO_CAP = {"zh": "", "en": ""}

# Picture groups cut by scripts/crop_sections_156.py: (page, group) -> section. Captions are only the text
# printed on the brochure page; tiles with no printed caption keep empty ones. The tile count must match
# scripts/work156/section_specs.json.
SECTION_GROUPS = {
    (3, "a"): ("custom", _caps(("圆形出料口", "Round discharge nozzle"), ("镀铁氟龙涂层", "Teflon coating"), ("多头称重分装机", "Multi head weighing"), ("定制304材质", "Customized 304 material"))),
    (5, "a"): ("pair", _caps(("封口机", "Sealing machine"), ("包装机", "Packaging machine"), ("液体包装机", "Liquid packaging machine"))),
    (6, "a"): ("pair", _caps(("封口机", "Sealing machine"), ("真空机", "Vacuum machine"), ("包装机", "Packaging machine"))),
    (7, "a"): ("detail", _caps(("料斗可拆卸,便于清洁内部称重盘;标配机均201材质,支持定制304不锈钢", "The hopper is detachable for cleaning the weighing pan inside; standard machines are 201 material, customized 304 stainless steel supported"))),
    (8, "a"): ("case", [NO_CAP] * 3),
    (10, "a"): ("case", [NO_CAP] * 3),
    (12, "a"): ("case", [NO_CAP] * 2),
    (15, "a"): ("custom", _caps(("加大储料斗", "Increase the storage hopper"), ("机身加高", "increase height"), ("圆形出料口", "Round discharge nozzle"), ("定制304材质", "Customized 304 material"))),
    (16, "a"): ("custom", _caps(("加配搅拌器", "Add mixer"), ("镀铁氟龙涂层", "Teflon coating"), ("料斗加配吸料机", "Add feeding machine"), ("定制支架款", "Customized support type"))),
    (17, "a"): ("custom", _caps(("加大储料斗", "Increase the storage hopper"), ("机身加高", "increase height"), ("圆形出料口", "Round discharge nozzle"), ("定制304材质", "Customized 304 material"))),
    (18, "a"): ("custom", _caps(("加配搅拌器", "Add mixer"), ("镀铁氟龙涂层", "Teflon coating"), ("料斗加配吸料机", "Add feeding machine"), ("定制支架款", "Customized support type"))),
    (19, "a"): ("pair", _caps(("斗式上料机", "Bucket feeder machine"), ("吸料机", "Material suction machine"), ("平行传送带", "Parallel conveyor belt"))),
    (22, "a"): ("detail", _caps(("大容量料斗,双仓下料", "Large capacity hopper, dual bin discharge"), ("双称工作:可设定不同重量/混合灌装", "Dual scale work: can set weights mixed filling"))),
    (23, "a"): ("pair", _caps(("斗式上料机", "Bucket feeder machine"), ("吸料机", "Material suction machine"), ("平行传送带", "Parallel conveyor belt"))),
    (24, "a"): ("case", [NO_CAP, NO_CAP]),
    (26, "a"): ("detail", _caps(("三头称,大容量储料斗", "Three head scale, large capacity storage hopper"), ("三头称重,轮流下料模式,快速灌装", "Three head weighing, Alternate feeding mode, rapid filling"))),
    (27, "a"): ("pair", _caps(("平放真空机", "Lying vacuum machine"), ("吸料机", "Material suction machine"), ("米砖真空机", "Rice brick vacuum machine"))),
    (28, "a"): ("pair", _caps(("斗式上料机", "Bucket feeder machine"), ("大米整形真空机", "Rice bag shaping vacuum machine"), ("平行传送带", "Parallel conveyor belt"))),
    (28, "b"): ("custom", [{"zh": "控制系统可改做PLC系统触控屏", "en": "The control system can be modified to a PLC system with a touch screen"}]),
    (39, "a"): ("showcase", [NO_CAP] * 4),
    (41, "a"): ("showcase", [NO_CAP] * 4),
    (42, "a"): ("showcase", [NO_CAP] * 5),
    (43, "a"): ("showcase", [NO_CAP] * 4),
    (44, "a"): ("options", _caps(("色带打码机", "Ribbon Printer"), ("光标", "Cursor"), ("定制多头称包装", "Customized multi head packaging"), ("传送带", "Conveyor belt"))),
    (45, "a"): ("showcase", [NO_CAP] * 4),
}
# Extra descriptions printed next to a group.
GROUP_DESC = {
    (24, "a"): {"zh": "定制机身加高,人工站立工作;搭配上料机自动加料;自动称重灌装,平行输送", "en": "Customized body height increase, manual standing work; equipped with an automatic feeding machine for material addition; automatic weighing and filling, parallel conveying"},
}
# Pages that share another page's picture groups (the brochure prints one group for several models).
GROUP_PAGE_ALIASES = {10: 9, 12: 9}
# Groups whose page prints its own heading instead of the standard one.
GROUP_TITLES = {
    (10, "a"): {"zh": "部分定制案例", "en": "Partial Custom Solutions"},
    (12, "a"): {"zh": "按需定制", "en": "Customized As Needed"},
}
GROUP_DESC[(10, "a")] = {
    "zh": "定制多头称重灌装机,可混合或轮流两种灌装方式;四头称螺旋内部、八头称螺旋内部",
    "en": "Customized multi-head weighing filling machine, which can be used for mixed filling or sequential filling; inside of the four-head and eight-head weighing spirals",
}
GROUP_DESC[(12, "a")] = {
    "zh": "计数盘分装机案例。适用产品:五金配件、螺丝、螺帽、垫片、电子配件、干燥剂、小公仔、饰品、纽扣、橡皮擦、糖果、珠子、等各类不规则产品",
    "en": "Counting-plate filling machine case. Widely used in hardware accessories, screws, nuts, gaskets, electronic components, desiccants, small figurines, jewelry, buttons, erasers, candies, beads, etc.",
}


def _load_blue_groups():
    """Batch 2: the blue-band groups, captions kept in work156/blue_groups.py next to the crop boxes."""
    import importlib.util

    spec = importlib.util.spec_from_file_location("blue_groups", Path(__file__).resolve().parent / "work156" / "blue_groups.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    for pg, (kind, caps) in mod.GROUPS.items():
        SECTION_GROUPS[(pg, "a")] = (kind, _caps(*caps))
    specs = json.loads((Path(__file__).resolve().parent / "work156" / "section_specs.json").read_text(encoding="utf-8"))
    tiles = {(g["page"], g["group"]): len(g["tiles"]) for g in specs}
    for pg in mod.SHOWCASE:
        SECTION_GROUPS[(pg, "a")] = ("showcase", [NO_CAP] * tiles[(pg, "a")])


def _check_group_specs():
    specs = json.loads((Path(__file__).resolve().parent / "work156" / "section_specs.json").read_text(encoding="utf-8"))
    tiles = {(g["page"], g["group"]): len(g["tiles"]) for g in specs}
    for key, (_, caps) in SECTION_GROUPS.items():
        if tiles.get(key) != len(caps):
            raise SystemExit(f"picture group {key}: {tiles.get(key)} cropped tiles but {len(caps)} captions")
    missing = set(tiles) - set(SECTION_GROUPS)
    if missing:
        raise SystemExit(f"cropped picture groups without data: {sorted(missing)}")


def build_gallery_sections(page):
    sections = []
    for (pg, grp), (kind, caps) in SECTION_GROUPS.items():
        if GROUP_PAGE_ALIASES.get(pg, pg) != page:
            continue
        items = []
        for i, cap in enumerate(caps, 1):
            items.append({"zh": cap["zh"], "en": cap["en"], "image": f"/images/machines/sec-p{pg:03d}-{grp}-{i}.webp"})
        sec = {"kind": "gallery", "title": GROUP_TITLES.get((pg, grp), GALLERY_TITLES[kind]), "items": items}
        if (pg, grp) in GROUP_DESC:
            sec["desc"] = GROUP_DESC[(pg, grp)]
        sections.append(sec)
    return sections


def variant_slug(v):
    table = {"平盖": "flat", "凸盖": "convex", "单泵": "single-pump", "双泵": "double-pump"}
    for zh, en in table.items():
        v = v.replace(zh, en)
    return slugify(v)


def main():
    _load_blue_groups()
    _check_group_specs()
    raw = []
    for path in sorted(SRC.glob("part_*.json")):
        raw.extend(json.loads(path.read_text(encoding="utf-8")))
    raw.sort(key=lambda m: (m["page"], m["model"]))

    machines = []
    seen = set()
    for it in raw:
        model = it["model"].strip().upper()
        if model in SKIP_MODELS:
            continue
        if not model:
            model = "24头" if it["page"] == 8 else f"P{it['page']}"
        model = MODEL_FIXES.get((it["page"], model), model)
        name_en = it["name_en"]
        fix = NAME_EN_FIXES.get((it["page"], model))
        if fix:
            name_en = fix(name_en)

        mid = slugify(model) if model != "24头" else "bean-24head"
        if model in DUPLICATE_BY_PAGE:
            mid += f"-p{it['page']}"
        if it.get("variant"):
            mid += "-" + variant_slug(it["variant"])
        if mid in seen:
            raise SystemExit(f"duplicate id {mid} (page {it['page']})")
        seen.add(mid)

        machine = {
            "id": mid,
            "model": model,
            "category": it["category"],
            "name": {"zh": it["name_zh"], "en": name_en},
            "image": f"/images/machines/{mid}.webp",
            "params": [
                {
                    "key": p["key"],
                    "zh": p["zh"],
                    "en": p["en"],
                    "value_zh": p["value_zh"],
                    "value_en": p["value_en"],
                }
                for p in it["params"]
                if p.get("value_zh") or p.get("value_en")
            ],
            "source": {"page": it["page"], "extra_pages": it.get("extra_pages", [])},
        }
        apply_tiers(machine, model)
        extras = it.get("extra_pages", [])
        if extras:
            machine["images"] = [machine["image"]] + [f"/images/machines/extra/p{n:03d}.webp" for n in extras]
        if it.get("notes"):
            machine["notes"] = it["notes"]
        sections = build_sections(it) + build_gallery_sections(it["page"])
        if sections:
            machine["sections"] = sections
        machines.append(machine)

    order = {slug: i for i, (slug, _, _) in enumerate(CATEGORIES)}
    unknown = sorted({m["category"] for m in machines} - set(order))
    if unknown:
        raise SystemExit(f"Unmapped categories: {unknown}")
    machines.sort(key=lambda m: (order[m["category"]], m["source"]["page"]))

    categories = [
        {
            "id": slug,
            "name": {"zh": zh, "en": en},
            "count": sum(1 for m in machines if m["category"] == slug),
        }
        for slug, zh, en in CATEGORIES
    ]

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "machines.json").write_text(json.dumps(machines, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUT / "categories.json").write_text(json.dumps(categories, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(machines)} machines, {len(categories)} categories")
    for c in categories:
        print(f"  {c['id']:16} {c['count']}")


if __name__ == "__main__":
    main()
