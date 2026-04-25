import assert from "node:assert/strict";
import { test } from "node:test";
import { createAdapter } from "../dist/index.js";

const allowedFields = {
  level: { type: "string", operators: ["==", "!=", "=in=", "=out="] },
  message: {
    type: "string",
    operators: ["==", "!=", "=contains=", "=starts=", "=ends=", "=regex="],
  },
  host: {
    type: "string",
    targetPath: "metadata.host",
    operators: [
      "==",
      "!=",
      "=contains=",
      "=starts=",
      "=ends=",
      "=in=",
      "=out=",
    ],
  },
  timestamp: { type: "date", operators: [">", ">=", "<", "<="] },
  statusCode: {
    type: "number",
    operators: ["==", "!=", ">", ">=", "<", "<=", "=in="],
  },
  archived: { type: "boolean", operators: ["==", "!=", "=exists="] },
};

test("exports a standard adapter factory", () => {
  const adapter = createAdapter();
  assert.equal(adapter.supports("rsql", "mongodb"), true);
  assert.equal(adapter.supports("sql", "mongodb"), false);
});

test("converts equality and AND expressions", () => {
  const adapter = createAdapter();
  const result = adapter.convert({
    query: "level==error;host==api-01",
    options: { allowedFields },
  });
  assert.deepEqual(result.filter, {
    $and: [{ level: "error" }, { "metadata.host": "api-01" }],
  });
});

test("converts equality wildcard to escaped regex", () => {
  const adapter = createAdapter();
  const result = adapter.convert({
    query: "message==*098*",
    options: { allowedFields },
  });
  assert.deepEqual(result.filter, {
    message: { $regex: "^.*098.*$", $options: "i" },
  });
});

test("converts equality wildcard and escapes regex characters", () => {
  const adapter = createAdapter();
  const result = adapter.convert({
    query: "message==*log[098].txt*",
    options: { allowedFields },
  });
  assert.deepEqual(result.filter, {
    message: { $regex: "^.*log\\[098\\]\\.txt.*$", $options: "i" },
  });
});

test("converts not-equal wildcard to negative regex", () => {
  const adapter = createAdapter();
  const result = adapter.convert({
    query: "message!=*debug*",
    options: { allowedFields },
  });
  assert.deepEqual(result.filter, {
    message: { $not: { $regex: "^.*debug.*$", $options: "i" } },
  });
});

test("keeps non-wildcard equality unchanged", () => {
  const adapter = createAdapter();
  const result = adapter.convert({
    query: "message==Synthetic",
    options: { allowedFields },
  });
  assert.deepEqual(result.filter, { message: "Synthetic" });
});

test("converts list operators", () => {
  const adapter = createAdapter();
  const result = adapter.convert({
    query: "level=in=(error,critical)",
    options: { allowedFields },
  });
  assert.deepEqual(result.filter, { level: { $in: ["error", "critical"] } });
});

test("casts number values", () => {
  const adapter = createAdapter();
  const result = adapter.convert({
    query: "statusCode>=500",
    options: { allowedFields },
  });
  assert.deepEqual(result.filter, { statusCode: { $gte: 500 } });
});

test("casts date values", () => {
  const adapter = createAdapter();
  const result = adapter.convert({
    query: "timestamp>=2026-04-25T00:00:00Z",
    options: { allowedFields },
  });
  assert.ok(result.filter.timestamp.$gte instanceof Date);
  assert.equal(
    result.filter.timestamp.$gte.toISOString(),
    "2026-04-25T00:00:00.000Z",
  );
});

test("rejects unknown fields", () => {
  const adapter = createAdapter();
  assert.throws(
    () =>
      adapter.convert({ query: "unknown==value", options: { allowedFields } }),
    /Field is not allowed/,
  );
});
