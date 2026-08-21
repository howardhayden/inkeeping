import assert from "node:assert/strict";
import test from "node:test";
import { LIST_PAGE_SIZE, pageContaining, paginate } from "../app/list-pagination.ts";

test("large indexes use one bounded 100-row pagination contract", () => {
  assert.equal(LIST_PAGE_SIZE, 100);
  const boundaries = [
    { total: 0, page: 0, count: 0, start: 0, end: 0, pages: 1 },
    { total: 1, page: 0, count: 1, start: 1, end: 1, pages: 1 },
    { total: 100, page: 0, count: 100, start: 1, end: 100, pages: 1 },
    { total: 101, page: 1, count: 1, start: 101, end: 101, pages: 2 },
    { total: 200, page: 1, count: 100, start: 101, end: 200, pages: 2 },
    { total: 201, page: 2, count: 1, start: 201, end: 201, pages: 3 },
  ];
  for (const expected of boundaries) {
    const items = Array.from({ length: expected.total }, (_, index) => index);
    const result = paginate(items, expected.page);
    assert.equal(result.items.length, expected.count, `${expected.total} items`);
    assert.equal(result.start, expected.start, `${expected.total} start`);
    assert.equal(result.end, expected.end, `${expected.total} end`);
    assert.equal(result.pages, expected.pages, `${expected.total} pages`);
  }
});

test("pagination clamps hostile and stale page requests without reviving hidden rows", () => {
  const items = Array.from({ length: 101 }, (_, index) => ({ id: `R-${index + 1}` }));
  assert.equal(paginate(items, -50).page, 0);
  assert.equal(paginate(items, Number.NaN).page, 0);
  const beyond = paginate(items, 99);
  assert.equal(beyond.page, 1);
  assert.deepEqual(beyond.items.map((item) => item.id), ["R-101"]);

  const shrunk = paginate(items.slice(0, 20), beyond.page);
  assert.equal(shrunk.page, 0);
  assert.equal(shrunk.items.length, 20);
  assert.throws(() => paginate(items, 0, 101), /Page size/);
});

test("selected records resolve to their containing page after creation or update", () => {
  const items = Array.from({ length: 250 }, (_, index) => ({ id: `R-${index + 1}` }));
  assert.equal(pageContaining(items, (item) => item.id === "R-1"), 0);
  assert.equal(pageContaining(items, (item) => item.id === "R-101"), 1);
  assert.equal(pageContaining(items, (item) => item.id === "R-250"), 2);
  assert.equal(pageContaining(items, (item) => item.id === "missing"), 0);
});
