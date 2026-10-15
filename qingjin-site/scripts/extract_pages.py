"""Export every embedded page image from the brochure PDF without re-encoding.

The brochure has no text layer: each page is a single DCTDecode (JPEG) stream,
so the raw stream bytes are a valid JPEG file.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PDF = ROOT.parent.parent / "画册33.pdf"
OUT = ROOT / "work" / "pages"


def main() -> None:
    pdf = Path(sys.argv[1]) if len(sys.argv) > 1 else PDF
    OUT.mkdir(parents=True, exist_ok=True)
    data = pdf.read_bytes()
    count = 0
    for m in re.finditer(rb"/Filter\s*/DCTDecode.*?stream\r?\n", data, re.S):
        start = m.end()
        end = data.find(b"endstream", start)
        count += 1
        (OUT / f"p{count:02d}.jpg").write_bytes(data[start:end].rstrip(b"\r\n"))
    print(f"exported {count} pages to {OUT}")


if __name__ == "__main__":
    main()
