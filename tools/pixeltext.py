"""Pixel-art text for the board: the house cat (web/public/favicon.svg) above lines in a 3×5 font, as a PNG
to lay with Modération → « Poser une image ». The logo uses palette colours only, so nothing shifts on import.

    python3 tools/pixeltext.py out.png "1. CHOISIS UNE COULEUR EN BAS" "2. CLIQUE SUR LA TOILE" ...

Needs Pillow. Unknown characters are an error: add their glyph to CAPS or SMALL.
"""

import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
INK = (0x37, 0x37, 0x37)  # palette "Gris foncé"
GAP = 3  # px between the cat and the text

# 3×5, after /u/Udzu's "3x5 minifont": capitals and digits 4 high (rows 0-3); lower case 3 high (rows 1-3)
# with ascenders on row 0 and descenders on row 4. Rows top to bottom, '1' = ink.
CAPS = {
    "A": "111 101 111 101", "B": "110 111 101 111", "C": "111 100 100 111", "D": "110 101 101 110",
    "E": "111 110 100 111", "F": "111 100 110 100", "G": "111 100 101 111", "H": "101 111 101 101",
    "I": "111 010 010 111", "J": "001 001 101 111", "K": "101 110 101 101", "L": "100 100 100 111",
    "M": "111 111 101 101", "N": "111 101 101 101", "O": "111 101 101 111", "P": "111 101 111 100",
    "Q": "111 101 111 011", "R": "111 101 110 101", "S": "111 110 011 111", "T": "111 010 010 010",
    "U": "101 101 101 111", "V": "101 101 101 010", "W": "101 101 111 111", "X": "101 010 101 101",
    "Y": "101 111 010 010", "Z": "111 011 110 111",
    "0": "111 101 101 111", "1": "110 010 010 111", "2": "111 011 100 111", "3": "111 011 001 111",
    "4": "101 101 111 001", "5": "111 110 001 110", "6": "100 111 101 111", "7": "111 001 010 010",
    "8": "011 111 101 110", "9": "111 101 111 001",
}
SMALL = {  # x-height rows 1-3, plus row 0 (ascender, accent) and row 4 (descender)
    "a": "000 011 101 111 000", "b": "100 111 101 111 000", "c": "000 111 100 111 000",
    "d": "001 111 101 111 000", "e": "000 111 110 111 000", "f": "011 111 010 010 000",
    "g": "000 111 101 111 011", "h": "100 111 101 101 000", "i": "1 0 1 1 0", "j": "01 00 01 01 11",
    "k": "100 101 110 101 000", "l": "1 1 1 1 0", "m": "000 111 111 101 000", "n": "000 110 101 101 000",
    "o": "000 111 101 111 000", "p": "000 111 101 111 100", "q": "000 111 101 111 001",
    "r": "000 111 100 100 000", "s": "000 011 010 110 000", "t": "010 111 010 011 000",
    "u": "000 101 101 111 000", "v": "000 101 101 010 000", "w": "000 101 111 111 000",
    "x": "000 101 010 101 000", "y": "000 101 101 111 011", "z": "000 110 010 011 000",
    "é": "001 111 110 111 000", "è": "100 111 110 111 000", "ê": "010 111 110 111 000",
    "ë": "101 111 110 111 000", "à": "100 011 101 111 000", "â": "010 011 101 111 000",
    "ç": "000 111 100 111 010", "ù": "100 101 101 111 000", "û": "010 101 101 111 000",
    "ô": "010 111 101 111 000", "î": "010 000 010 010 000", "ï": "101 000 010 010 000",
    ".": "0 0 0 1 0", ",": "0 0 0 1 1", ":": "0 1 0 1 0", "!": "1 1 0 1 0", "'": "1 1 0 0 0",
    "-": "000 000 111 000 000", "?": "111 011 000 010 000", " ": "00 00 00 00 00",
}
FONT = {**{k: v + " " + "0" * len(v.split()[0]) for k, v in CAPS.items()}, **SMALL}


def width(line: str) -> int:
    return sum(len(FONT[ch].split()[0]) + 1 for ch in line) - 1


def main(out: str, lines: list[str]) -> None:
    cat = {}
    svg = (ROOT / "web/public/favicon.svg").read_text()
    for fill, d in re.findall(r'fill="(#\w+)" d="([^"]+)"', svg):
        for x, y in re.findall(r"M(\d+) (\d+)", d):
            cat[int(x), int(y)] = fill
    tw = max(width(line) for line in lines)
    w, h = max(tw, 10), 10 + GAP + 6 * len(lines) - 1
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for (x, y), hexa in cat.items():
        img.putpixel(((w - 10) // 2 + x, y), tuple(int(hexa[i:i + 2], 16) for i in (1, 3, 5)) + (255,))
    for n, line in enumerate(lines):
        cx, top = (w - tw) // 2, 10 + GAP + 6 * n
        for ch in line:
            rows = FONT[ch].split()
            for r, row in enumerate(rows):
                for k, bit in enumerate(row):
                    if bit == "1":
                        img.putpixel((cx + k, top + r), INK + (255,))
            cx += len(rows[0]) + 1
    img.save(out)
    print(f"{out}: {w} × {h}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2:])
