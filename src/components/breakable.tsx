import { Fragment } from "react";

/**
 * Text that wraps only after the given characters (by default "/") and at
 * spaces, never inside a segment, so "/time-activities" cannot split at its
 * hyphen. The text itself is unchanged, so selecting and copying it works.
 */
export function Breakable({ text, after = "/" }: { text: string; after?: string }) {
  return (
    <>
      {text.split(/(\s+)/).map((word, w) => {
        if (/^\s+$/.test(word) || word === "") return word;
        const segments: string[] = [];
        let current = "";
        for (const ch of word) {
          current += ch;
          if (after.includes(ch)) {
            segments.push(current);
            current = "";
          }
        }
        if (current) segments.push(current);
        return (
          <Fragment key={w}>
            {segments.map((segment, i) => (
              <Fragment key={i}>
                <span className="whitespace-nowrap">{segment}</span>
                {i < segments.length - 1 ? <wbr /> : null}
              </Fragment>
            ))}
          </Fragment>
        );
      })}
    </>
  );
}
