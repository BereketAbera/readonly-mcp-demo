// The header mark, outlined by design/build.sh from the drawing in design/graphics.py.
// Change the drawing there and rerun the script; don't edit these paths by hand.
export const MARK_PATHS: ReadonlyArray<{ d: string; accent?: true }> = [
  { d: "M4.33,7.5A1.2,1.2 0 0 0 4,9.17L8.56,16 4,22.83a1.2,1.2 0 0 0 0.33,1.66 1.2,1.2 0 0 0 1.66,-0.33L10.64,17.2H13.5A1.2,1.2 0 0 0 14.7,16 1.2,1.2 0 0 0 13.5,14.8H10.64L6,7.83A1.2,1.2 0 0 0 4.33,7.5ZM22.75,8.8A1.2,1.2 0 0 0 21.55,10v6 6A1.2,1.2 0 0 0 22.75,23.2 1.2,1.2 0 0 0 23.95,22V17.2H28.5A1.2,1.2 0 0 0 29.7,16 1.2,1.2 0 0 0 28.5,14.8H23.95V10A1.2,1.2 0 0 0 22.75,8.8Z" },
  { d: "M2.3 8.5a2.7 2.7 0 1 0 5.4 0a2.7 2.7 0 1 0 -5.4 0ZM2.3 23.5a2.7 2.7 0 1 0 5.4 0a2.7 2.7 0 1 0 -5.4 0Z" },
  { d: "M13.5 10.5L21.5 16L13.5 21.5Z", accent: true },
];
