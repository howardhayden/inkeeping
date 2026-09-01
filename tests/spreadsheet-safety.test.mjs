import assert from "node:assert/strict";
import test from "node:test";
import { classifySpreadsheetCell, protectSpreadsheetCell, unprotectSpreadsheetCell } from "../app/spreadsheet-safety.ts";

test("Unicode whitespace, format controls, apostrophe chains, and compatibility sigils cannot conceal formula-like prefixes", () => {
  const prefixes = ["", " ", "\t", "\u00a0", "\ufeff", "\u200b", "\u2060", "\u202e", "'", " \u200b'\u2060"];
  const sigils = ["=", "+", "-", "@", "\uff1d", "\uff0b", "\uff0d", "\uff20"];
  for (const prefix of prefixes) {
    for (const sigil of sigils) {
      const value = `${prefix}${sigil}SUM(A1:A2)`;
      const protectedValue = protectSpreadsheetCell(value);
      assert.equal(protectedValue, `'${value}`);
      assert.equal(classifySpreadsheetCell(protectedValue), "protected");
      assert.deepEqual(unprotectSpreadsheetCell(protectedValue), { value, state: "protected" });
    }
  }
});

test("benign values stay byte-exact and an unprotected formula-like value remains visibly risky", () => {
  for (const value of ["Title", "1+1", "https://example.org/?q==", "DDE is discussed", "", "O'Brien"]) {
    assert.equal(classifySpreadsheetCell(value), "safe");
    assert.equal(protectSpreadsheetCell(value), value);
    assert.deepEqual(unprotectSpreadsheetCell(value), { value, state: "safe" });
  }
  assert.equal(classifySpreadsheetCell("\u200b=HYPERLINK(\"https://invalid.example\")"), "active-risk");
});

test("one protection sentinel preserves an original apostrophe chain on round trip", () => {
  const original = "''=literal-looking-risk";
  const protectedValue = protectSpreadsheetCell(original);
  assert.equal(protectedValue, `'''=literal-looking-risk`);
  assert.deepEqual(unprotectSpreadsheetCell(protectedValue), { value: original, state: "protected" });
});
