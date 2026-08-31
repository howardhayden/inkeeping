import assert from "node:assert/strict";
import test from "node:test";
import { assertSafeJsonText } from "../app/json-safety.ts";

test("JSON quarantine rejects duplicate member names before parsing discards evidence", () => {
  assert.throws(
    () => assertSafeJsonText('{"id":"first","id":"second"}'),
    /duplicate member name "id"/i,
  );
  assert.throws(
    () => assertSafeJsonText('{"record":{"identifier":"first","identifier":"second"}}'),
    /duplicate member name "identifier"/i,
  );
});

test("JSON quarantine compares decoded member names, including escape-equivalent names", () => {
  assert.throws(
    () => assertSafeJsonText('{"id":"first","\\u0069d":"second"}'),
    /duplicate member name "id"/i,
  );
  assert.throws(
    () => assertSafeJsonText('{"𝄞":1,"\\uD834\\uDD1E":2}'),
    /duplicate member name/i,
  );
});

test("JSON quarantine scopes duplicate detection to each object", () => {
  const parsed = assertSafeJsonText('{"left":{"id":"A"},"right":{"id":"B"},"items":[{"id":"C"},{"id":"D"}]}');
  assert.deepEqual(parsed, {
    left: { id: "A" },
    right: { id: "B" },
    items: [{ id: "C" }, { id: "D" }],
  });
});

test("JSON quarantine accepts valid escaped surrogate pairs", () => {
  const parsed = assertSafeJsonText('{"\\uD834\\uDD1E":"\\uD83D\\uDE00"}');
  assert.deepEqual(parsed, { "𝄞": "😀" });
});

test("JSON quarantine rejects lone high and low surrogates in keys and values", () => {
  for (const source of [
    '{"\\uD800":"value"}',
    '{"\\uDC00":"value"}',
  ]) {
    assert.throws(() => assertSafeJsonText(source), /unpaired Unicode surrogate.*key/i);
  }

  for (const source of [
    '{"key":"\\uD800"}',
    '{"key":"\\uDC00"}',
  ]) {
    assert.throws(() => assertSafeJsonText(source), /unpaired Unicode surrogate.*value/i);
  }
});

test("JSON quarantine accepts normal nested JSON without changing values", () => {
  const source = '{"text":"braces } and escaped quote \\", stay data","unicode":"café","values":[true,false,null,-1.25e2]}';
  assert.deepEqual(assertSafeJsonText(source), JSON.parse(source));
});
