"""Crop hero / factory / certificate images and build logo variants into public/images."""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
HALVES = os.path.join(ROOT, "work", "halves")
OUT = os.path.join(ROOT, "..", "public", "images")
LOGO_SRC = os.path.join(ROOT, "..", "..", "12ce887ebbd9484f4d89e2ab68fe2933.jpg")

INSET = 10

FACTORY = {
    "factory-1": (123, 531, 933, 930),
    "factory-2": (959, 531, 1546, 930),
    "factory-3": (123, 959, 584, 1352),
    "factory-4": (607, 959, 1066, 1352),
    "factory-5": (1088, 959, 1546, 1352),
    "batch-production": (123, 1505, 455, 1967),
    "accessories": (486, 1505, 816, 1967),
    "bending": (847, 1505, 1180, 1967),
    "laser": (1209, 1505, 1539, 1967),
}

CERTS = {
    "cert-1": (230, 705, 604, 1218),
    "cert-2": (642, 705, 1015, 1218),
    "cert-3": (1055, 705, 1427, 1218),
    "cert-4": (89, 1414, 437, 1900),
    "cert-5": (464, 1414, 812, 1900),
    "cert-6": (847, 1414, 1193, 1900),
    "cert-7": (1222, 1414, 1570, 1900),
}


def save(im, sub, name, max_w=1400):
    d = os.path.join(OUT, sub)
    os.makedirs(d, exist_ok=True)
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    im.save(os.path.join(d, name + ".webp"), "WEBP", quality=84, method=6)


def crop_set(half, boxes, sub, inset=INSET):
    src = Image.open(os.path.join(HALVES, half + ".jpg")).convert("RGB")
    for name, (l, t, r, b) in boxes.items():
        save(src.crop((l + inset, t + inset, r - inset, b - inset)), sub, name)


def logos():
    src = Image.open(LOGO_SRC).convert("RGB")
    w, h = src.size
    rgba = Image.new("RGBA", src.size)
    px, out = src.load(), rgba.load()
    # Black background -> alpha by max channel; keeps anti-aliased edges smooth.
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            a = max(r, g, b)
            if a < 24:
                out[x, y] = (0, 0, 0, 0)
            else:
                k = 255 / a
                out[x, y] = (min(255, round(r * k)), min(255, round(g * k)), min(255, round(b * k)), a)
    bbox = rgba.getbbox()
    full = rgba.crop(bbox)
    d = os.path.join(OUT, "brand")
    os.makedirs(d, exist_ok=True)
    full.save(os.path.join(d, "logo-dark-bg.png"))  # white text, for dark backgrounds

    # Light-background variant: recolor near-white (text) pixels to brand navy.
    light = full.copy()
    lp = light.load()
    for y in range(light.height):
        for x in range(light.width):
            r, g, b, a = lp[x, y]
            if a and min(r, g, b) > 170:
                lp[x, y] = (15, 39, 84, a)
    light.save(os.path.join(d, "logo-light-bg.png"))

    # Mark only (the two shapes above the text), for header + favicon.
    mark_bottom = round(0.53 * h) - bbox[1]
    mark = full.crop((0, 0, full.width, mark_bottom))
    mark = mark.crop(mark.getbbox())
    mark.save(os.path.join(d, "mark.png"))
    side = max(mark.size)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(mark, ((side - mark.width) // 2, (side - mark.height) // 2))
    pub = os.path.join(OUT, "..")
    sq.resize((32, 32), Image.LANCZOS).save(os.path.join(pub, "favicon.png"))
    sq.resize((180, 180), Image.LANCZOS).save(os.path.join(pub, "apple-touch-icon.png"))
    sq.save(os.path.join(pub, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])


if __name__ == "__main__":
    crop_set("h02", {"hero-machines": (150, 720, 1530, 1490)}, "hero", inset=0)
    crop_set("h03", FACTORY, "factory")
    crop_set("h04", CERTS, "certs", inset=4)
    logos()
    print("done")
