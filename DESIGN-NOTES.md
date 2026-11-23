# Design notes

The reader this demo has to convince is a venue owner, not a developer. What they most need to see, at a glance, is
that the server can only read and cannot leak personal data. Three visual changes were made with that in mind. The
colours, the Geist type and the cards were already this demo's own and stay as they were.

## 1. One-way data path (overview page)

- **What:** a drawn diagram in place of the five icon cards that listed the request order. Data runs one way, from
  Connecteam and ROLLER to ClickUp. Two red stops show where every write is stopped (the GET-only client) and where
  personal details are removed (the tools). A green box lists what does reach ClickUp. Numbered dots place the nine
  checks from How it works on the path, and a line under the diagram links there.
- **Where:** `/`, section "One-way data path" (`src/components/one-way-path.tsx`, drawings in
  `src/components/diagrams/`). A wide layout from 1024 px up, a tall one below that.
- **Why:** the job post asks for "strictly read-only" and "secure", and its third screening question asks how the
  server can't modify or leak data. The site already answered in words. Now the owner gets the same answer as one
  picture, including what does leave the server. The old cards (a robot, a lock, a wrench) were the most
  template-looking block on the page, and they showed the order of a request rather than what is stopped.
- **Notes:** the SVGs are inlined, not loaded as images, so their text is set in the page's Geist, stays sharp at any
  zoom and adds about 6.5 KB each. Screen readers skip the drawing and read the figure caption, which describes the
  same path in words, check numbers included.

## 2. A mark of its own

- **What:** two dots (Connecteam and ROLLER) whose lines join, pass a one-way valve and leave as one line (ClickUp).
  The valve is the diode symbol, a triangle against a bar, which lets current through in one direction only. Ink
  lines, with the site's blue for the triangle.
- **Where:** the header logo on every page (`src/components/brand-mark.tsx`); the favicon (`src/app/icon.svg`, a
  heavier cut on a white tile so it still shows on dark tab bars); the Apple touch icon (`src/app/apple-icon.png`);
  and the social preview (`src/app/opengraph-image.png`, with its alt text in `opengraph-image.alt.txt`).
- **Why:** the old logo was a stock shield and tick in a blue square, the default picture for any security app. It
  sat top-left on every page and in all three screenshots attached to the proposal. The new mark draws this server's
  promise: two systems in, one way out, nothing back. The dots keep it from reading as a media "next" button at
  16 px.
- **Social preview:** the old image was drawn at build time without a font, so it fell back to the renderer's
  default typeface and lost every bold weight. It is now a PNG from the same script, with the mark, the headline in
  Geist Bold and the demo's 30.8% labour figure. That figure is fixed in `design/build.sh`;
  `tests/unit/social-preview.test.ts` fails if the demo data stops giving it, and the fix is to update the number
  and rerun the script.

## 3. Fewer stock icons

- **What:** removed the icons in pale-green squares beside each item in "What keeps it read-only, and what it
  shares" (overview) and "Working in your accounts" (connect), plus the single icons beside "Ask it in ClickUp" and
  the two answer boxes on How it works.
- **Why:** an icon in a tinted square beside every item is a stock feature-list pattern, and each one only repeated
  its bold line (a crossed-out eye beside "details removed"). With the mark and the diagram in place, these were
  the only generic pictures left. Icons that carry meaning stay: the mock-data notice, the Copy and Run buttons, the
  hero badges and the readOnlyHint badges on Tools.

## Copy

- The tool picker on `/tools` separated each name from its title with an em dash. It now uses the middle dot the
  rest of the site uses.
- README: "What the demo proves" is now "What the demo shows", because that section itself says the APIs are mocked
  and ClickUp is untested.

## Rebuilding the graphics

Every graphic is drawn by `design/graphics.py` (Python 3, standard library only) and finished with Inkscape 1.4:

```bash
sh design/build.sh    # about two seconds; INKSCAPE=/path/to/inkscape to use another binary
```

It runs four steps:

1. Draws the SVG sources into `design/out/` (not committed) and the two diagram layouts into
   `src/components/diagrams/`.
2. Has Inkscape outline the mark's strokes, then writes `src/app/icon.svg` and `src/components/brand-mark-paths.ts`
   from the outlines, so the logo looks the same in every browser and tab bar.
3. Has Inkscape render `src/app/apple-icon.png` (180 px) and `src/app/opengraph-image.png` (1200 x 630).
4. Has Inkscape measure every label in the diagram, and stops with an error if one runs outside its box. Previews
   to look at land in `design/out/one-way-path-*@2x.png`.

Inkscape is pointed at `design/fonts/Geist-Variable.ttf` and nothing else, so the PNGs use the typeface the site
loads and no text can fall back to another font. Geist is under the SIL Open Font License (`design/fonts/OFL.txt`).
The colours are copied from `src/app/globals.css`; if those change, update the constants at the top of the script.
To change the diagram's words, edit `SOURCES`, `STAGES` and `NOTES` in the script, rerun it, and keep the figure
caption in `src/components/one-way-path.tsx` in step.
