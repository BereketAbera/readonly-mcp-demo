#!/usr/bin/env python3
"""Draws the demo's graphics as SVG, with the standard library only.

  mark      Two sources (Connecteam, ROLLER) join, pass a one-way valve and
            leave as one line (ClickUp). Used for the header logo, the
            favicon, the Apple touch icon and the social preview.
  diagram   The one-way data path on the overview page, in a wide layout for
            desktops and a tall one for phones and tablets.
  og        The 1200x630 social preview.

Run design/build.sh rather than this file: it calls `draw`, then Inkscape to
outline the mark, render the PNGs and measure the diagram's text, then
`finish` and `check`.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "design" / "out"
DIAGRAMS = ROOT / "src" / "components" / "diagrams"

# Colours from src/app/globals.css, plus a pale red for the two stops.
INK = "#0d1626"
MUTED = "#4a5466"
BORDER = "#dbe0e7"
CARD = "#ffffff"
PAGE = "#f5f6f8"
PRIMARY = "#1a4fc2"
ACCENT = "#e7eefb"
ACCENT_FG = "#143b8f"
STOP = "#b42318"
STOP_SOFT = "#fdeeec"
STOP_LINE = "#f0c3bd"
MOCK_LINE = "#c9a24f"
MOCK_SOFT = "#fff3d4"
MOCK_FG = "#7a4a00"
OK = "#0a6b39"
OK_SOFT = "#e6f5ec"
OK_LINE = "#b3dbc3"

FONT = "Geist, sans-serif"


def num(v: float) -> str:
    """Shortest form of a number, at most 2 decimals: 12, 12.5, 12.25."""
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("", "-0") else s


def svg_open(w: float, h: float, extra: str = "") -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{num(w)}" height="{num(h)}" '
        f'viewBox="0 0 {num(w)} {num(h)}"{extra}>'
    )


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


# --------------------------------------------------------------------------
# Mark
# --------------------------------------------------------------------------
# On a 32-unit grid: two source dots, lines that meet, a short stem, then a
# triangle butting against an upright bar (the diode symbol: current passes
# one way only) and one line out. The dots keep it from reading as a media
# "next" button at small sizes.


def mark(favicon: bool = False, scale: float = 1.0) -> str:
    """The mark as stroked SVG, scaled about the centre of the grid.

    The favicon cut has thicker lines, bigger dots and a bigger triangle so it
    still reads at 16 px.
    """

    def p(x: float, y: float) -> str:
        return f"{num(16 + (x - 16) * scale)} {num(16 + (y - 16) * scale)}"

    if favicon:
        dot_r, width = 3.1, 3.1
        dots = [(5.5, 8.5), (5.5, 23.5)]
        lines = f"M{p(5.5, 8.5)}L{p(10.5, 16)}H{num(16 + (13 - 16) * scale)}M{p(5.5, 23.5)}L{p(10.5, 16)}"
        bar = f"M{p(22.9, 9.6)}V{num(16 + (22.4 - 16) * scale)}M{p(22.9, 16)}H{num(16 + (28 - 16) * scale)}"
        tri = f"M{p(12.6, 9.6)}L{p(21.6, 16)}L{p(12.6, 22.4)}Z"
    else:
        dot_r, width = 2.7, 2.4
        dots = [(5, 8.5), (5, 23.5)]
        lines = f"M{p(5, 8.5)}L{p(10, 16)}H{num(16 + (13.5 - 16) * scale)}M{p(5, 23.5)}L{p(10, 16)}"
        bar = f"M{p(22.75, 10)}V{num(16 + (22 - 16) * scale)}M{p(22.75, 16)}H{num(16 + (28.5 - 16) * scale)}"
        tri = f"M{p(13.5, 10.5)}L{p(21.5, 16)}L{p(13.5, 21.5)}Z"
    r = dot_r * scale
    dot_d = "".join(
        f"M{num(16 + (x - 16) * scale - r)} {num(16 + (y - 16) * scale)}"
        f"a{num(r)} {num(r)} 0 1 0 {num(2 * r)} 0a{num(r)} {num(r)} 0 1 0 {num(-2 * r)} 0Z"
        for x, y in dots
    )
    return (
        f'<path d="{lines}{bar}" fill="none" stroke="{INK}" stroke-width="{num(width * scale)}" '
        f'stroke-linecap="round" stroke-linejoin="round"/>'
        f'<path d="{dot_d}" fill="{INK}"/>'
        f'<path d="{tri}" fill="{PRIMARY}"/>'
    )


TILE = f'<rect x="0.5" y="0.5" width="31" height="31" rx="7" fill="{CARD}" stroke="{BORDER}"/>'


def draw_mark() -> None:
    # Header logo, shown at 28 px. Inkscape outlines both of these.
    write(OUT / "mark.svg", svg_open(32, 32) + mark() + "</svg>")
    # Favicon cut, sized to sit on a white tile (added after outlining).
    write(OUT / "mark-favicon.svg", svg_open(32, 32) + mark(favicon=True, scale=0.88) + "</svg>")
    # Apple touch icon: full-bleed white, as iOS rounds the corners itself.
    write(
        OUT / "apple-icon.svg",
        svg_open(180, 180)
        + f'<rect width="180" height="180" fill="{CARD}"/>'
        + f'<g transform="translate(90 90) scale(4.1) translate(-16 -16)">{mark()}</g></svg>',
    )


# --------------------------------------------------------------------------
# Drawing helpers for the diagram and the social preview
# --------------------------------------------------------------------------


class Canvas:
    """Collects SVG elements and, for the layout check, the box each line of
    text has to stay inside."""

    def __init__(self) -> None:
        self.parts: list[str] = []
        self.checks: list[dict] = []

    def add(self, s: str) -> None:
        self.parts.append(s)

    def text(self, x, y, s, size, fill, weight=400, anchor="start", spacing=None, inside=None) -> None:
        attrs = f'x="{num(x)}" y="{num(y)}" font-size="{num(size)}" fill="{fill}"'
        if weight != 400:
            attrs += f' font-weight="{weight}"'
        if anchor != "start":
            attrs += f' text-anchor="{anchor}"'
        if spacing:
            attrs += f' letter-spacing="{num(spacing)}"'
        if inside:
            tid = f"t{len(self.checks) + 1}"
            self.checks.append({"id": tid, "box": list(inside), "text": s})
            attrs += f' data-check="{tid}"'
        self.add(f"<text {attrs}>{escape(s)}</text>")

    def rect(self, x, y, w, h, fill, stroke, r=10, dash=None) -> None:
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(
            f'<rect x="{num(x + 0.5)}" y="{num(y + 0.5)}" width="{num(w - 1)}" height="{num(h - 1)}" '
            f'rx="{num(r)}" fill="{fill}" stroke="{stroke}"{d}/>'
        )

    def line(self, d, stroke, width=1.75, dash=None) -> None:
        da = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(
            f'<path d="{d}" fill="none" stroke="{stroke}" stroke-width="{num(width)}" '
            f'stroke-linecap="round" stroke-linejoin="round"{da}/>'
        )

    def head(self, x, y, direction) -> None:
        """Filled arrowhead with its tip at (x, y)."""
        if direction == "right":
            d = f"M{num(x)} {num(y)}L{num(x - 8)} {num(y - 4.5)}V{num(y + 4.5)}Z"
        else:
            d = f"M{num(x)} {num(y)}L{num(x - 4.5)} {num(y - 8)}H{num(x + 4.5)}Z"
        self.add(f'<path d="{d}" fill="{INK}"/>')

    def stopped(self, x, y1, y2) -> None:
        """A dashed red line from y1 that ends in a bar at y2."""
        self.line(f"M{num(x)} {num(y1)}V{num(y2)}", STOP, 1.75, "4 3.5")
        self.line(f"M{num(x - 11)} {num(y2)}H{num(x + 11)}", STOP, 3)

    def markers(self, x, y, numbers) -> None:
        """Numbered dots matching the nine checks on /how-it-works; x is the left edge."""
        for i, n in enumerate(numbers):
            cx = x + 8.5 + i * 21
            self.add(f'<circle cx="{num(cx)}" cy="{num(y)}" r="8.5" fill="{ACCENT}"/>')
            self.text(cx, y + 3.7, str(n), 10.5, ACCENT_FG, 600, "middle")

    def svg(self, w, h, font=True) -> str:
        extra = f' font-family="{FONT}"' if font else ""
        return svg_open(w, h, extra) + "".join(self.parts) + "</svg>"


def card(c: Canvas, x, y, w, h, title, lines, tone="plain") -> None:
    fill, stroke, dash = {
        "plain": (CARD, BORDER, None),
        "mock": (MOCK_SOFT, MOCK_LINE, "5 4"),
        "ok": (OK_SOFT, OK_LINE, None),
    }[tone]
    c.rect(x, y, w, h, fill, stroke, dash=dash)
    box = (x, y, w, h)
    c.text(x + 14, y + 27, title, 15, INK, 600, inside=box)
    for i, s in enumerate(lines):
        c.text(x + 14, y + 49 + i * 18, s, 13, MUTED, inside=box)


def card_height(lines: list[str]) -> float:
    return 60 + 18 * (len(lines) - 1)


def note(c: Canvas, x, y, w, title, lines, tone) -> float:
    """A stop (red) or what-reaches-ClickUp (green) box. Returns its height."""
    fill, stroke, fg, body = {"stop": (STOP_SOFT, STOP_LINE, STOP, STOP), "ok": (OK_SOFT, OK_LINE, OK, INK)}[tone]
    h = 38 + 17 * len(lines)
    c.rect(x, y, w, h, fill, stroke)
    box = (x, y, w, h)
    c.text(x + 14, y + 23, title, 13.5, fg, 600, inside=box)
    for i, s in enumerate(lines):
        c.text(x + 14, y + 42 + i * 17, s, 12.5, body, inside=box)
    return h


# --------------------------------------------------------------------------
# One-way data path (overview page)
# --------------------------------------------------------------------------
# One set of words for both layouts, wrapped for each width. The numbered
# dots are the nine sections of /how-it-works. Keep the figure's text
# alternative in src/components/one-way-path.tsx in step with these words.

SOURCES = [
    ("Connecteam (AU)", {"wide": ["staff, shifts, time clock,", "pay rates"], "tall": ["staff, shifts,", "time clock, pay rates"]}),
    ("ROLLER", {"wide": ["bookings, products,", "payments, revenue"], "tall": ["bookings, products,", "payments, revenue"]}),
]
STAGES = {
    "client": {
        "title": "GET-only client",
        "checks": [2, 3, 8],
        "wide": ["Reads a fixed list of paths.", "Its only other call is the", "sign-in token request."],
        "tall": ["Reads a fixed list of paths. Its only", "other call is the sign-in token request."],
    },
    "tools": {
        "title": "9 read-only tools",
        "checks": [1, 4, 5],
        "wide": ["Named fields only, then", "masked again. Dates checked,", "31 days at most."],
        "tall": ["Named fields only, then masked again.", "Dates checked, 31 days at most."],
    },
    "gate": {
        "title": "Gate",
        "checks": [6, 7],
        "wide": ["Bearer token,", "origin list,", "rate limit"],
        "tall": ["Bearer token, origin list, rate limit"],
    },
    "clickup": {
        "title": "ClickUp AI",
        "checks": [],
        "wide": ["Brain or a", "Super Agent"],
        "tall": ["Brain or a Super Agent"],
    },
}
NOTES = {
    "client": ("stop", "Stopped: every write", {"wide": ["POST, PUT, PATCH, DELETE"], "tall": ["POST, PUT, PATCH, DELETE"]}),
    "tools": (
        "stop",
        "Removed: personal details",
        {
            "wide": ["guest names, phone, email,", "address, birth date, bank, card,", "TFN, Medicare, medical flags"],
            "tall": ["guest names, phone, email, address,", "birth date, bank, card, TFN,", "Medicare, medical flags"],
        },
    ),
    "clickup": (
        "ok",
        "What reaches ClickUp",
        {
            "wide": ["staff names, shifts, hours, labour totals,", "pay as department averages,", "bookings, payments, revenue"],
            "tall": ["staff names, shifts, hours, labour", "totals, pay as department averages,", "bookings, payments, revenue"],
        },
    ),
}
ORDER = ["client", "tools", "gate", "clickup"]


def mocked_label(c: Canvas) -> None:
    c.text(0, 13, "MOCKED IN THIS DEMO", 11, MOCK_FG, 600, spacing=0.7)
    c.markers(146, 9, [9])


def diagram_wide() -> tuple[Canvas, float, float]:
    """Desktop layout, 1104 wide: the max-w-6xl content width, so 1:1 at 1440."""
    c = Canvas()
    W = 1104
    top, ch = 62, 98  # the stage cards
    mid = top + ch / 2  # the line the data travels along
    x = {"client": 256, "tools": 500, "gate": 786, "clickup": 958}
    w = {"client": 204, "tools": 246, "gate": 132, "clickup": 146}

    mocked_label(c)
    sw, sh = 196, 80
    s_ys = [30, 30 + sh + 12]
    for (title, lines), sy in zip(SOURCES, s_ys):
        card(c, 0, sy, sw, sh, title, lines["wide"], "mock")
    # The two inflows meet, as in the mark, then run into the client.
    join = 232
    for sy in s_ys:
        y0 = sy + sh / 2
        c.line(f"M{sw} {num(y0)}C{sw + 22} {num(y0)} {join - 20} {num(mid)} {join} {num(mid)}", INK)
    c.line(f"M{join} {num(mid)}H{x['client'] - 1}", INK)
    c.head(x["client"], mid, "right")

    for key in ORDER:
        stage = STAGES[key]
        card(c, x[key], top, w[key], ch, stage["title"], stage["wide"], "ok" if key == "clickup" else "plain")
        if stage["checks"]:
            c.markers(x[key], top - 14, stage["checks"])
    for a, b in zip(ORDER, ORDER[1:]):
        c.line(f"M{x[a] + w[a]} {num(mid)}H{x[b] - 1}", INK)
        c.head(x[b], mid, "right")

    # Each stop hangs off the stage that enforces it. What reaches ClickUp
    # hangs off ClickUp and spans the last two columns.
    ny = top + ch + 46
    heights = []
    for key in ("client", "tools"):
        tone, title, lines = NOTES[key]
        c.stopped(x[key] + w[key] / 2, top + ch, ny - 12)
        heights.append(note(c, x[key], ny, w[key], title, lines["wide"], tone))
    tone, title, lines = NOTES["clickup"]
    c.line(f"M{num(x['clickup'] + w['clickup'] / 2)} {top + ch}V{ny}", OK)
    heights.append(note(c, x["gate"], ny, W - x["gate"], title, lines["wide"], tone))
    return c, W, ny + max(heights)


def diagram_tall() -> tuple[Canvas, float, float]:
    """Phone and tablet layout, 320 wide: the same path running down."""
    c = Canvas()
    W = 320
    spine = 40  # x of the line the data travels down

    mocked_label(c)
    sw, sh, sy = 154, 80, 28
    s_xs = [0, W - sw]
    for (title, lines), sx in zip(SOURCES, s_xs):
        card(c, sx, sy, sw, sh, title, lines["tall"], "mock")

    y = sy + sh + 34
    for x0 in (spine, s_xs[1] + spine):  # both sources feed the client
        c.line(f"M{x0} {sy + sh}V{y - 1}", INK)
        c.head(x0, y, "down")

    for key in ORDER:
        stage = STAGES[key]
        lines = stage["tall"]
        h = card_height(lines)
        card(c, 0, y, W, h, stage["title"], lines, "ok" if key == "clickup" else "plain")
        if stage["checks"]:  # right-aligned beside the title, clear of the line
            c.markers(W - 14 - 21 * len(stage["checks"]) + 4, y + 21.5, stage["checks"])
        bottom = y + h
        if key == "clickup":
            tone, title, lines = NOTES[key]
            ny = bottom + 22
            c.line(f"M{spine} {bottom}V{ny}", OK)
            return c, W, ny + note(c, 0, ny, W, title, lines["tall"], tone)
        nxt = bottom + 34
        if key in NOTES:  # a stop hangs to the right of the line
            tone, title, lines = NOTES[key]
            nx, ny = spine + 24, bottom + 40
            c.stopped(nx + (W - nx) / 2, bottom, ny - 12)
            nxt = ny + note(c, nx, ny, W - nx, title, lines["tall"], tone) + 30
        c.line(f"M{spine} {bottom}V{nxt - 1}", INK)
        c.head(spine, nxt, "down")
        y = nxt
    raise AssertionError("ClickUp is the last stage")


def draw_diagrams() -> None:
    for name, build in (("wide", diagram_wide), ("tall", diagram_tall)):
        c, w, h = build()
        full = c.svg(w, h)
        # The site inlines this file; its text picks up the page's Geist.
        write(DIAGRAMS / f"one-way-path-{name}.svg", re.sub(r' data-check="t\d+"', "", full) + "\n")
        # Inkscape measures and renders a copy with ids on the checked lines
        # and the site's stylistic set switched on.
        style = '<style>text{font-feature-settings:"ss01"}</style>'
        check = re.sub(r'data-check="(t\d+)"', r'id="\1"', full).replace(">", ">" + style, 1)
        write(OUT / f"one-way-path-{name}.check.svg", check)
        write(OUT / f"one-way-path-{name}.checks.json", json.dumps(c.checks, indent=1))


# --------------------------------------------------------------------------
# Social preview, 1200 x 630
# --------------------------------------------------------------------------


def draw_og(labour_percent: float) -> None:
    c = Canvas()
    W, H = 1200, 630
    figure = f"{labour_percent:.1f}%"
    c.add(f'<rect width="{W}" height="{H}" fill="{PAGE}"/>')
    # Mark and name, as in the site header.
    c.add(f'<g transform="translate(70 62) scale(1.75)">{mark()}</g>')
    c.text(138, 98, "Lakeside read-only MCP", 26, INK, 600)
    c.text(72, 196, "Connecteam + ROLLER to ClickUp, read-only", 30, PRIMARY, 600)
    c.text(72, 268, "Staff, roster and revenue data", 60, INK, 700, spacing=-1.2)
    c.text(72, 336, "for ClickUp's AI", 60, INK, 700, spacing=-1.2)
    # The headline figure from the demo data.
    c.rect(72, 392, 470, 174, ACCENT, ACCENT, r=22)
    c.text(104, 488, figure, 92, ACCENT_FG, 700, spacing=-2)
    c.text(106, 534, "labour cost % of net revenue, 4 weeks", 24, ACCENT_FG)
    c.text(W - 72, 528, "Remote MCP server · nine read-only tools", 24, MUTED, anchor="end")
    c.text(W - 72, 562, "Sample by Bereket A. · fictional data", 24, MUTED, anchor="end")
    write(OUT / "og.svg", c.svg(W, H))
    # No trailing newline: Next.js puts the whole file into og:image:alt.
    write(
        ROOT / "src" / "app" / "opengraph-image.alt.txt",
        "Read-only MCP server: Connecteam and ROLLER data for ClickUp's AI, with labour cost at "
        f"{figure} of net revenue over four weeks of fictional demo data",
    )


# --------------------------------------------------------------------------
# finish: turn Inkscape's outlined mark into the files the site uses
# --------------------------------------------------------------------------


def outlined(svg_file: Path) -> list[tuple[str, str]]:
    """(colour, path data) for each path in an Inkscape plain-SVG export.

    Paths stay separate: the outlined lines and the dots overlap, and merging
    them into one path could punch holes where they wind in opposite ways.
    """
    found = []
    for tag in re.findall(r"<path\b[^>]*>", svg_file.read_text()):
        d = re.search(r'\sd="([^"]+)"', tag).group(1)
        colour = re.search(r"fill:(#[0-9a-fA-F]{6})", tag) or re.search(r'fill="(#[0-9a-fA-F]{6})"', tag)
        found.append((colour.group(1).lower() if colour else INK, tidy(d)))
    return found


def tidy(d: str) -> str:
    """Rounds Inkscape's coordinates to 2 decimals and drops spare spaces."""
    d = re.sub(r"-?\d*\.\d+(?:e-?\d+)?", lambda m: num(float(m.group(0))), d)
    d = re.sub(r"\s*,\s*", ",", d)
    d = re.sub(r"\s*([A-Za-z])\s*", r"\1", d)
    return re.sub(r"\s+", " ", d).strip()


def finish() -> None:
    paths = outlined(OUT / "mark-outlined.svg")
    rows = "".join(
        f'  {{ d: "{d}"{", accent: true" if colour == PRIMARY else ""} }},\n' for colour, d in paths
    )
    write(
        ROOT / "src" / "components" / "brand-mark-paths.ts",
        "// The header mark, outlined by design/build.sh from the drawing in design/graphics.py.\n"
        "// Change the drawing there and rerun the script; don't edit these paths by hand.\n"
        f"export const MARK_PATHS: ReadonlyArray<{{ d: string; accent?: true }}> = [\n{rows}];\n",
    )
    icon = "".join(f'<path d="{d}" fill="{colour}"/>' for colour, d in outlined(OUT / "mark-favicon-outlined.svg"))
    write(ROOT / "src" / "app" / "icon.svg", svg_open(32, 32) + TILE + icon + "</svg>\n")


# --------------------------------------------------------------------------
# check: every diagram label sits inside its box (Inkscape measured them)
# --------------------------------------------------------------------------


def check() -> int:
    problems = []
    for name in ("wide", "tall"):
        bbox = {}
        for row in (OUT / f"one-way-path-{name}.bbox").read_text().splitlines():
            parts = row.split(",")
            if len(parts) == 5:
                bbox[parts[0]] = [float(v) for v in parts[1:]]
        for item in json.loads((OUT / f"one-way-path-{name}.checks.json").read_text()):
            bx, by, bw, bh = item["box"]
            tx, ty, tw, th = bbox[item["id"]]
            if tx < bx + 8 or tx + tw > bx + bw - 8 or ty < by + 4 or ty + th > by + bh - 4:
                problems.append(f"{name}: '{item['text']}' ends at x={tx + tw:.1f}, its box at x={bx + bw:.1f}")
    for p in problems:
        print(p, file=sys.stderr)
    print(f"diagram text check: {len(problems)} problem(s)")
    return 1 if problems else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    draw = sub.add_parser("draw", help="write the SVG sources")
    draw.add_argument(
        "--labour-percent", type=float, required=True, help="labour cost %% of net revenue for the social preview"
    )
    sub.add_parser("finish", help="clean Inkscape's outlined mark into src/")
    sub.add_parser("check", help="check the diagram text against Inkscape's measurements")
    args = parser.parse_args()
    if args.cmd == "draw":
        draw_mark()
        draw_diagrams()
        draw_og(args.labour_percent)
        return 0
    if args.cmd == "finish":
        finish()
        return 0
    return check()


if __name__ == "__main__":
    sys.exit(main())
