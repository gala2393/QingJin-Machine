"""Merge scripts/work/data/part_*.json into src/data/machines.json + categories.json."""
import glob
import json
import os
import re

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "work", "data")
OUT = os.path.join(ROOT, "..", "src", "data")

# Order here = display order on the site.
CATEGORIES = [
    ("filling", "智能分装机", "Intelligent Filling Machines"),
    ("packaging", "智能包装机", "Intelligent Packaging Machines"),
    ("liquid", "液体包装机", "Liquid Packaging Machines"),
    ("paste", "膏体包装机", "Paste Packaging Machines"),
    ("semi-auto", "半自动灌装机", "Semi-Automatic Filling Machines"),
    ("vacuum", "真空包装机", "Vacuum Packaging Machines"),
    ("feeder", "智能上料机", "Intelligent Feeders"),
    ("conveyor", "传送带", "Conveyor Belts"),
]
CAT_BY_ZH = {zh: slug for slug, zh, _ in CATEGORIES}


def half_num(v):
    return int(re.sub(r"\D", "", str(v)))


def is_placeholder(v):
    # Brochure template leftovers such as "000KG" or "00×00×000cm" carry no real value.
    digits = re.sub(r"\D", "", v)
    return not v or v in {"-", "/"} or bool(re.fullmatch(r"0+", digits))


def slugify(s):
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s or "item"


def main():
    items = []
    for path in sorted(glob.glob(os.path.join(SRC, "part_*.json"))):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        items.extend(data if isinstance(data, list) else data.get("items", data.get("machines", [])))

    unknown = sorted({i["category_zh"] for i in items if i["category_zh"] not in CAT_BY_ZH})
    if unknown:
        raise SystemExit(f"Unmapped categories: {unknown}")

    # Slot numbering differs between parts (0/1 vs 1/2); normalize to 0-based per half.
    by_half = {}
    for it in items:
        it["half"] = half_num(it["half"])
        by_half.setdefault(it["half"], []).append(it)
    for group in by_half.values():
        base = min(int(g["slot"]) for g in group)
        for g in group:
            g["slot"] = int(g["slot"]) - base

    items.sort(key=lambda i: (i["half"], i["slot"]))
    cat_order = {slug: n for n, (slug, _, _) in enumerate(CATEGORIES)}
    seen = {}
    out = []
    for it in items:
        model = (it.get("model") or "").strip()
        base = slugify(model) if model else slugify(it["name_en"])
        seen[base] = seen.get(base, 0) + 1
        mid = base if seen[base] == 1 else f"{base}-{seen[base]}"
        params = [
            {k: str(p.get(k, "")).strip() for k in ("key", "zh", "en", "value_zh", "value_en")}
            for p in it["params"]
        ]
        params = [p for p in params if not (is_placeholder(p["value_zh"]) and is_placeholder(p["value_en"]))]
        for p in params:
            if is_placeholder(p["value_zh"]):
                p["value_zh"] = p["value_en"]
            elif is_placeholder(p["value_en"]):
                p["value_en"] = p["value_zh"]
        out.append({
            "id": mid,
            "model": model or it["name_en"],
            "category": CAT_BY_ZH[it["category_zh"]],
            "name": {"zh": it["name_zh"].strip(), "en": it["name_en"].strip()},
            "image": f"/images/machines/{mid}.webp",
            "params": params,
            "source": {"half": it["half"], "slot": it["slot"], "page": it["half"] - 4},
            "notes": it.get("notes", ""),
        })
    out.sort(key=lambda m: (cat_order[m["category"]], m["source"]["half"], m["source"]["slot"]))

    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "machines.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    counts = {}
    for m in out:
        counts[m["category"]] = counts.get(m["category"], 0) + 1
    cats = [{"id": s, "name": {"zh": zh, "en": en}, "count": counts.get(s, 0)} for s, zh, en in CATEGORIES]
    with open(os.path.join(OUT, "categories.json"), "w", encoding="utf-8") as f:
        json.dump(cats, f, ensure_ascii=False, indent=2)
    print(f"{len(out)} machines", counts)


if __name__ == "__main__":
    main()
