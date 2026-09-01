export type SpreadsheetCellClassification = "safe" | "protected" | "active-risk";

/**
 * Classifies formula-like prefixes after Unicode whitespace/format controls,
 * apostrophe chains, and compatibility normalization. This is a conservative
 * transport warning, not a claim about any named spreadsheet product.
 */
export function classifySpreadsheetCell(value: string): SpreadsheetCellClassification {
  if (typeof value !== "string") throw new Error("Spreadsheet cell must be text.");
  if (value.startsWith("'") && formulaLikePrefix(value.slice(1))) return "protected";
  return formulaLikePrefix(value) ? "active-risk" : "safe";
}

export function protectSpreadsheetCell(value: string): string {
  if (typeof value !== "string") throw new Error("Spreadsheet cell must be text.");
  return formulaLikePrefix(value) ? `'${value}` : value;
}

export function unprotectSpreadsheetCell(value: string): { value: string; state: SpreadsheetCellClassification } {
  const state = classifySpreadsheetCell(value);
  return state === "protected" ? { value: value.slice(1), state } : { value, state };
}

function formulaLikePrefix(value: string): boolean {
  let remainder = value;
  while (remainder.length) {
    const character = String.fromCodePoint(remainder.codePointAt(0)!);
    if (character === "'" || /[\p{White_Space}\p{Cf}]/u.test(character)) remainder = remainder.slice(character.length);
    else break;
  }
  if (!remainder) return false;
  return /^[=+@-]/.test(remainder.normalize("NFKC"));
}
