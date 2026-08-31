const JSON_WHITESPACE = /[\u0009\u000a\u000d\u0020]/;
const JSON_HEX_DIGIT = /^[0-9A-Fa-f]$/;
const MAX_JSON_SCAN_DEPTH = 256;

type JsonScan = {
  text: string;
  index: number;
};

function skipWhitespace(scan: JsonScan): void {
  while (scan.index < scan.text.length && JSON_WHITESPACE.test(scan.text[scan.index])) scan.index += 1;
}

function scanString(scan: JsonScan): { raw: string; end: number } {
  const start = scan.index;
  if (scan.text[start] !== '"') throw new Error("JSON object member names must be strings.");
  scan.index += 1;

  while (scan.index < scan.text.length) {
    const character = scan.text[scan.index];
    const code = scan.text.charCodeAt(scan.index);
    if (character === '"') {
      scan.index += 1;
      return { raw: scan.text.slice(start, scan.index), end: scan.index };
    }
    if (code <= 0x1f) throw new Error("JSON strings cannot contain unescaped control characters.");
    if (character !== "\\") {
      scan.index += 1;
      continue;
    }

    const escape = scan.text[scan.index + 1];
    if (escape === undefined) throw new Error("JSON string contains an incomplete escape sequence.");
    if ('"\\/bfnrt'.includes(escape)) {
      scan.index += 2;
      continue;
    }
    if (escape !== "u") throw new Error("JSON string contains an invalid escape sequence.");
    for (let offset = 2; offset < 6; offset += 1) {
      if (!JSON_HEX_DIGIT.test(scan.text[scan.index + offset] ?? "")) {
        throw new Error("JSON string contains an invalid Unicode escape sequence.");
      }
    }
    scan.index += 6;
  }

  throw new Error("JSON string is not terminated.");
}

function decodedMemberName(raw: string): string {
  const value = JSON.parse(raw) as unknown;
  if (typeof value !== "string") throw new Error("JSON object member names must be strings.");
  return value;
}

function memberNameLabel(value: string): string {
  const bounded = value.length > 80 ? `${value.slice(0, 79)}…` : value;
  return JSON.stringify(bounded);
}

function scanPrimitive(scan: JsonScan): void {
  const start = scan.index;
  while (scan.index < scan.text.length) {
    const character = scan.text[scan.index];
    if (character === "," || character === "]" || character === "}" || JSON_WHITESPACE.test(character)) break;
    scan.index += 1;
  }
  if (scan.index === start) throw new Error(`JSON value is missing near character ${scan.index + 1}.`);
}

function scanValue(scan: JsonScan, depth: number): void {
  if (depth > MAX_JSON_SCAN_DEPTH) throw new Error(`JSON nesting exceeds ${MAX_JSON_SCAN_DEPTH} levels.`);
  skipWhitespace(scan);
  const character = scan.text[scan.index];
  if (character === '"') {
    scanString(scan);
    return;
  }
  if (character === "{") {
    scanObject(scan, depth + 1);
    return;
  }
  if (character === "[") {
    scanArray(scan, depth + 1);
    return;
  }
  scanPrimitive(scan);
}

function scanObject(scan: JsonScan, depth: number): void {
  scan.index += 1;
  const memberNames = new Set<string>();
  skipWhitespace(scan);
  if (scan.text[scan.index] === "}") {
    scan.index += 1;
    return;
  }

  while (scan.index < scan.text.length) {
    skipWhitespace(scan);
    const { raw } = scanString(scan);
    const memberName = decodedMemberName(raw);
    if (memberNames.has(memberName)) {
      throw new Error(`JSON object contains duplicate member name ${memberNameLabel(memberName)}.`);
    }
    memberNames.add(memberName);

    skipWhitespace(scan);
    if (scan.text[scan.index] !== ":") throw new Error(`JSON object member requires : near character ${scan.index + 1}.`);
    scan.index += 1;
    scanValue(scan, depth);
    skipWhitespace(scan);

    const delimiter = scan.text[scan.index];
    if (delimiter === "}") {
      scan.index += 1;
      return;
    }
    if (delimiter !== ",") throw new Error(`JSON object member must end with , or } near character ${scan.index + 1}.`);
    scan.index += 1;
  }

  throw new Error("JSON object is not terminated.");
}

function scanArray(scan: JsonScan, depth: number): void {
  scan.index += 1;
  skipWhitespace(scan);
  if (scan.text[scan.index] === "]") {
    scan.index += 1;
    return;
  }

  while (scan.index < scan.text.length) {
    scanValue(scan, depth);
    skipWhitespace(scan);
    const delimiter = scan.text[scan.index];
    if (delimiter === "]") {
      scan.index += 1;
      return;
    }
    if (delimiter !== ",") throw new Error(`JSON array value must end with , or ] near character ${scan.index + 1}.`);
    scan.index += 1;
  }

  throw new Error("JSON array is not terminated.");
}

function assertUnicodeScalarString(value: string, location: "key" | "value"): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new Error(`JSON contains an unpaired Unicode surrogate in an object ${location}.`);
      }
      index += 1;
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error(`JSON contains an unpaired Unicode surrogate in an object ${location}.`);
    }
  }
}

/** Reject duplicate decoded member names before JSON.parse can discard earlier values. */
export function assertNoDuplicateJsonKeys(text: string): void {
  if (typeof text !== "string") throw new Error("JSON input must be text.");
  const scan: JsonScan = { text, index: 0 };
  skipWhitespace(scan);
  scanValue(scan, 0);
  skipWhitespace(scan);
  if (scan.index !== text.length) throw new Error(`JSON contains trailing content near character ${scan.index + 1}.`);
}

/** Reject strings or member names that are not sequences of Unicode scalar values. */
export function assertUnicodeScalarTree(value: unknown): void {
  const pending: unknown[] = [value];
  while (pending.length) {
    const current = pending.pop();
    if (typeof current === "string") {
      assertUnicodeScalarString(current, "value");
      continue;
    }
    if (Array.isArray(current)) {
      for (const child of current) pending.push(child);
      continue;
    }
    if (!current || typeof current !== "object") continue;
    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      assertUnicodeScalarString(key, "key");
      pending.push(child);
    }
  }
}

/** Parse JSON only after lossless member-name and Unicode quarantine checks pass. */
export function assertSafeJsonText(text: string): unknown {
  assertNoDuplicateJsonKeys(text);
  const parsed = JSON.parse(text) as unknown;
  assertUnicodeScalarTree(parsed);
  return parsed;
}
