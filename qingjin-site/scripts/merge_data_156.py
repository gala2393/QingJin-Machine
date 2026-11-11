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


def variant_slug(v):
    table = {"平盖": "flat", "凸盖": "convex", "单泵": "single-pump", "双泵": "double-pump"}
    for zh, en in table.items():
        v = v.replace(zh, en)
    return slugify(v)


def main():
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
