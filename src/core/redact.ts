/**
 * Output redaction, the second layer. The first layer is the tools
 * themselves: each one copies named fields from upstream records into its own
 * output shape (an allowlist), and every aggregate keyed by data, such as
 * totals per payment method or per department, is returned as an array, so
 * object keys in a result are always the server's own field names.
 *
 * This module then runs on every tool result before it leaves the server:
 *  1. Keys that name personal or financial fields are dropped wherever they
 *     appear (phone, email, home address, date of birth, bank, card and tax
 *     details, kiosk PINs, gift card numbers).
 *  2. Free text is scanned for email addresses, phone numbers, bank, tax file
 *     and Medicare numbers, which are masked in place.
 */

// #region redaction-rules
const SENSITIVE_KEY_PARTS = [
  "phone",
  "mobile",
  "email",
  "address",
  "birth",
  "bank",
  "iban",
  "swift",
  "accountnumber",
  "taxfile",
  "medicare",
  "creditcard",
  "cardnumber",
  "cardlast4",
  "kioskcode",
  "passcode",
  "giftcardnumber",
  "externalpaymentreference",
  "transactionid",
];
const SENSITIVE_KEYS_EXACT = new Set(["dob", "bsb", "tfn", "pin"]);

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const OBFUSCATED_EMAIL = /[A-Z0-9._%+-]+\s*(?:\[at\]|\(at\)|\{at\})\s*[A-Z0-9-]+(?:\s*(?:\.|\[dot\]|\(dot\))\s*[A-Z0-9-]+)+/gi;
const AU_PHONE = /(?<![\w+])(?:\+?61[\s.-]?|\(?0)\s?[23478]\)?(?:[\s.-]?\d){8}(?!\d)/g;
const INTL_PHONE = /(?<![\w+])\+\d{1,3}(?:[\s.-]?\d){7,12}(?!\d)/g;
const BSB = /\bBSB\b[\s:#.-]*\d{3}[\s-]?\d{3}/gi;
const ACCOUNT_NO = /\b(?:acc(?:oun)?t?|a\/c)\.?(?:\s*(?:no\.?|number|#))?[\s.:#-]*\d{6,10}\b/gi;
const TAX_FILE_NO = /\b(?:TFN|tax file(?:\s+number)?)\b[\s:#.-]*(?:(?:is|no\.?|number)\s*)?\d{3}[\s.-]?\d{3}[\s.-]?\d{2,3}\b/gi;
const MEDICARE_NO = /\bMedicare\b(?:\s*(?:card|no\.?|number|#))*[\s:#.-]*\d{4}[\s-]?\d{5}[\s-]?\d(?:[\s-]?\d)?\b/gi;
// #endregion redaction-rules

/** Connecteam custom field types that always hold personal data. */
const SENSITIVE_FIELD_TYPES = new Set(["phone", "email", "birthday", "location", "file", "image", "signature"]);
const SENSITIVE_FIELD_NAME_PARTS = [
  "emergency",
  "next of kin",
  "medical",
  "medicare",
  "health",
  "allerg",
  "disab",
  "injur",
  "passport",
  "licence",
  "license",
  "visa",
  "citizen",
  "tax",
  "tfn",
  "superannuation",
  "super fund",
  "super member",
  "working with children",
  "wwc",
  "blue card",
  "police check",
  "criminal",
  "gender",
  "sex",
  "pronoun",
  "religio",
  "ethnic",
  "indigenous",
  "salary",
  "wage",
];

export interface RedactionReport {
  removedKeys: number;
  maskedValues: number;
}

export function newReport(): RedactionReport {
  return { removedKeys: 0, maskedValues: 0 };
}

function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isSensitiveKey(key: string): boolean {
  const k = normaliseKey(key);
  return SENSITIVE_KEYS_EXACT.has(k) || SENSITIVE_KEY_PARTS.some((part) => k.includes(part));
}

/** Masks contact, bank, tax file and Medicare details found inside free text. */
export function maskText(text: string, report?: RedactionReport): string {
  const masked = text
    .replace(EMAIL, "[redacted email]")
    .replace(OBFUSCATED_EMAIL, "[redacted email]")
    .replace(TAX_FILE_NO, "[redacted tax file number]")
    .replace(MEDICARE_NO, "[redacted Medicare number]")
    .replace(BSB, "[redacted bank details]")
    .replace(ACCOUNT_NO, "[redacted bank details]")
    .replace(AU_PHONE, "[redacted phone]")
    .replace(INTL_PHONE, "[redacted phone]");
  if (report && masked !== text) report.maskedValues += 1;
  return masked;
}

/** Returns a deep copy with sensitive keys removed and free text masked. */
export function redactDeep<T>(value: T, report?: RedactionReport): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactDeep(item, report)) as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        if (report) report.removedKeys += 1;
        continue;
      }
      out[key] = redactDeep(inner, report);
    }
    return out as T;
  }
  if (typeof value === "string") {
    return maskText(value, report) as T;
  }
  return value;
}

/**
 * Second check on a workforce custom field. `list_staff` only returns custom
 * fields the deployment names in STAFF_EXTRA_FIELDS; even a named field is
 * refused when its type or name says it holds personal data.
 */
export function isShareableCustomField(field: { name: string; type: string }): boolean {
  if (SENSITIVE_FIELD_TYPES.has(field.type)) return false;
  if (isSensitiveKey(field.name)) return false;
  const name = field.name.toLowerCase();
  return !SENSITIVE_FIELD_NAME_PARTS.some((part) => name.includes(part));
}
