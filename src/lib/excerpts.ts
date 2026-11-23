import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Reads a `// #region name` ... `// #endregion name` block from the real
 * source at build time, so the excerpts on the site cannot drift from the code.
 */
export function excerpt(file: string, region: string): { file: string; code: string } {
  const text = readFileSync(path.join(process.cwd(), file), "utf8");
  const open = text.indexOf(`// #region ${region}`);
  const close = text.indexOf(`// #endregion ${region}`);
  if (open < 0 || close < 0) throw new Error(`Region ${region} not found in ${file}`);
  const lines = text.slice(text.indexOf("\n", open) + 1, close).replace(/\s+$/, "").split("\n");
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length));
  return { file, code: lines.map((l) => l.slice(indent)).join("\n") };
}
