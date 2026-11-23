export type TokenKind = "plain" | "comment" | "string" | "keyword" | "number" | "type";

const KEYWORDS = new Set([
  "async", "await", "break", "case", "catch", "class", "const", "constructor", "continue", "default", "else",
  "export", "extends", "finally", "for", "from", "function", "if", "implements", "import", "in", "interface",
  "let", "new", "of", "private", "readonly", "return", "static", "switch", "this", "throw", "try", "type",
  "typeof", "while", "true", "false", "null", "undefined", "as", "satisfies",
]);

const PATTERN = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\/(?![*/])(?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\n])+\/[gimsuy]*)|\b(\d[\d_]*(?:\.\d+)?)\b|([A-Za-z_$][\w$]*)/g;

/** A small TypeScript tokenizer: enough for readable excerpts without a highlighting dependency. */
export function highlight(code: string): Array<{ text: string; kind: TokenKind }> {
  const out: Array<{ text: string; kind: TokenKind }> = [];
  const re = new RegExp(PATTERN.source, "g");
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    const index = m.index;
    const [text, comment, str, regex, num, word] = m;
    if (regex) {
      // A slash only starts a regex literal after an operator or opening bracket; otherwise it divides.
      const prev = code.slice(0, index).trimEnd().slice(-1);
      if (prev && !"=(,:[!&|?{};".includes(prev)) {
        if (index > last) out.push({ text: code.slice(last, index), kind: "plain" });
        out.push({ text: "/", kind: "plain" });
        last = index + 1;
        re.lastIndex = index + 1;
        continue;
      }
    }
    if (index > last) out.push({ text: code.slice(last, index), kind: "plain" });
    let kind: TokenKind = "plain";
    if (comment) kind = "comment";
    else if (str || regex) kind = "string";
    else if (num) kind = "number";
    else if (word && KEYWORDS.has(word)) kind = "keyword";
    else if (word && /^[A-Z]/.test(word)) kind = "type";
    out.push({ text, kind });
    last = index + text.length;
  }
  if (last < code.length) out.push({ text: code.slice(last), kind: "plain" });
  return out;
}
