/**
 * Output redaction. Tool handlers already project upstream records onto
 * explicit output shapes; this module is the second layer that runs on every
 * tool result before it leaves the server.
 *
 *  1. Keys that name personal or financial fields are dropped wherever they
 *     appear (phone, email, home address, date of birth, bank and card details,
 *     kiosk PINs, gift card numbers).
 *  2. Free text is scanned for email addresses, phone numbers and bank
 *     details, which are masked in place.
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
const AU_PHONE = /(?<![\w+])(?:\+?61[\s-]?|\(?0)\s?[23478]\)?(?:[\s-]?\d){8}(?!\d)/g;
const INTL_PHONE = /(?<![\w+])\+\d{1,3}(?:[\s-]?\d){7,12}(?!\d)/g;
const BSB = /\bBSB\b[\s:#.-]*\d{3}[\s-]?\d{3}/gi;
const ACCOUNT_NO = /\b(?:acc(?:ount)?)(?:\s*(?:no|number))?[\s.:#-]*\d{6,10}\b/gi;
// #endregion redaction-rules

/** Connecteam custom field types that always hold personal data. */
const SENSITIVE_FIELD_TYPES = new Set(["phone", "email", "birthday", "location", "file"]);
const SENSITIVE_FIELD_NAME_PARTS = ["emergency", "medical", "passport", "licence", "license", "visa", "next of kin"];

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

/** Masks contact and bank details found inside free text. */
export function maskText(text: string, report?: RedactionReport): string {
  const masked = text
    .replace(EMAIL, "[redacted email]")
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

/** Whether a workforce custom field may be shown at all. */
export function isShareableCustomField(field: { name: string; type: string }): boolean {
  if (SENSITIVE_FIELD_TYPES.has(field.type)) return false;
  if (isSensitiveKey(field.name)) return false;
  const name = field.name.toLowerCase();
  return !SENSITIVE_FIELD_NAME_PARTS.some((part) => name.includes(part));
}
