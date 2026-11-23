import { describe, expect, it } from "vitest";
import { isSensitiveKey, isShareableCustomField, maskText, newReport, redactDeep } from "../../src/core/redact";

describe("key-based redaction", () => {
  it("drops personal and financial fields wherever they appear", () => {
    const input = {
      userId: 1001,
      name: "Sam Example",
      phoneNumber: "+61491570110",
      email: "sam@example.com",
      homeAddress: { street: "1 Example Street" },
      dateOfBirth: "2001-02-03",
      bankAccount: "000-000 00000000",
      bsb: "000-000",
      kioskCode: "4821",
      payments: [{ amount: 12.5, creditCardLast4Digits: "4242", transactionId: "pi_123", externalPaymentReference: "GC-1" }],
    };
    const report = newReport();
    const out = redactDeep(input, report);
    expect(out).toEqual({ userId: 1001, name: "Sam Example", payments: [{ amount: 12.5 }] });
    expect(report.removedKeys).toBe(10);
    // The input is not mutated.
    expect(input.phoneNumber).toBe("+61491570110");
  });

  it("recognises sensitive key spellings and leaves ordinary keys alone", () => {
    for (const key of ["phone", "mobile_phone", "Email", "email_address", "home_address", "DOB", "birthDate", "BSB", "tfn", "bank_details", "cardNumber"]) {
      expect(isSensitiveKey(key), key).toBe(true);
    }
    for (const key of ["name", "department", "total", "bookingReference", "date", "status", "paymentId", "tip"]) {
      expect(isSensitiveKey(key), key).toBe(false);
    }
  });
});

describe("free-text masking", () => {
  it.each([
    ["Call me on 0491 570 156 tomorrow", "Call me on [redacted phone] tomorrow"],
    ["Mobile +61 491 570 156", "Mobile [redacted phone]"],
    ["Office (07) 5550 1234 ext 2", "Office [redacted phone] ext 2"],
    ["UK contact +44 20 7946 0958", "UK contact [redacted phone]"],
    ["Email a.parent@example.com please", "Email [redacted email] please"],
    ["Pay into BSB 012-345 acc 12345678", "Pay into [redacted bank details] [redacted bank details]"],
  ])("masks %s", (input, expected) => {
    expect(maskText(input)).toBe(expected);
  });

  it("does not touch dates, times, money or references", () => {
    const text = "Booking 5020001 on 2026-11-21 at 10:30 totalled $1,250.00 (receipt 240001)";
    expect(maskText(text)).toBe(text);
  });

  it("masks strings nested inside results", () => {
    const out = redactDeep({ entries: [{ note: "Text me on 0491 570 156" }] });
    expect(out.entries[0].note).toBe("Text me on [redacted phone]");
  });
});

describe("workforce custom fields", () => {
  it("hides fields by type and by name", () => {
    expect(isShareableCustomField({ name: "Uniform size", type: "str" })).toBe(true);
    expect(isShareableCustomField({ name: "Department", type: "str" })).toBe(true);
    expect(isShareableCustomField({ name: "Date of birth", type: "birthday" })).toBe(false);
    expect(isShareableCustomField({ name: "Anything", type: "phone" })).toBe(false);
    expect(isShareableCustomField({ name: "Home", type: "location" })).toBe(false);
    expect(isShareableCustomField({ name: "Bank account", type: "str" })).toBe(false);
    expect(isShareableCustomField({ name: "Emergency contact name", type: "str" })).toBe(false);
    expect(isShareableCustomField({ name: "Medical notes", type: "str" })).toBe(false);
  });
});
