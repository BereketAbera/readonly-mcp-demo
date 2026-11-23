#!/bin/sh
# Rebuilds every graphic in the demo from design/graphics.py.
# Needs python3 and Inkscape 1.4; set INKSCAPE=/path/to/inkscape to use another binary.
#   sh design/build.sh
set -eu
cd "$(dirname "$0")/.."
INKSCAPE="${INKSCAPE:-inkscape}"
OUT=design/out
mkdir -p "$OUT"

# Inkscape sees only the bundled Geist, so no text can fall back to another font.
cat > "$OUT/fonts.conf" <<EOF
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>$PWD/design/fonts</dir>
  <cachedir>$PWD/$OUT/fontcache</cachedir>
</fontconfig>
EOF
export FONTCONFIG_FILE="$PWD/$OUT/fonts.conf"

# 1. Draw the SVG sources. The social preview shows labour_cost_percent over the
#    demo's four weeks (26 Oct to 22 Nov 2026); tests/unit/social-preview.test.ts
#    fails if the demo data stops matching this figure.
python3 design/graphics.py draw --labour-percent 30.8

# 2. Outline the mark's strokes so the logo and favicon render the same everywhere,
#    then write src/app/icon.svg and src/components/brand-mark-paths.ts.
for name in mark mark-favicon; do
  "$INKSCAPE" "$OUT/$name.svg" \
    --actions="select-all:all;object-stroke-to-path;export-plain-svg;export-filename:$OUT/$name-outlined.svg;export-do"
done
python3 design/graphics.py finish

# 3. The Apple touch icon and the social preview, with the text set in Geist.
"$INKSCAPE" "$OUT/apple-icon.svg" --export-type=png --export-width=180 --export-png-color-mode=RGB_8 \
  --export-filename=src/app/apple-icon.png
"$INKSCAPE" "$OUT/og.svg" --export-type=png --export-width=1200 --export-png-color-mode=RGB_8 \
  --export-filename=src/app/opengraph-image.png

# 4. The one-way diagram: measure every label against its box, and render
#    previews to look at (design/out/one-way-path-*@2x.png).
for v in wide tall; do
  "$INKSCAPE" "$OUT/one-way-path-$v.check.svg" --query-all > "$OUT/one-way-path-$v.bbox"
  "$INKSCAPE" "$OUT/one-way-path-$v.check.svg" --export-type=png --export-dpi=192 \
    --export-filename="$OUT/one-way-path-$v@2x.png"
done
python3 design/graphics.py check
