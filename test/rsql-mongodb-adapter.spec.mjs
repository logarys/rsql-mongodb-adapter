import assert from "node:assert/strict";
import { test } from "node:test";
import { createAdapter } from "../dist/index.js";

const allowedFields = {
  level: {
    type: "string",
    operators: ["==", "!=", "=in=", "=out="],
  },
  host: {
    type: "string",
    targetPath: "metadata.host",
    operators: ["==", "!=", "=contains=", "=starts=", "=ends=", "=in=", "=out="],
  },
  timestamp: {
    type: "date",
    operators: [">", ">=", "<", "<="],
  },
  statusCode: {
    type: "number",
    operators: ["==", "!=", ">", ">=", "<", "<=", "=in="],
  },
  archived: {
    type: "boolean",
    operators: ["==", "!=", "=exists="],
  },
};

test("exports a standard adapter factory", () => {
  const adapter = createAdapter();

  assert.equal(adapter.supports("rsql", "mongodb"), true);
  assert.equal(adapter.supports("sql", "mongodb"), false);
  assert.deepEqual(adapter.getMetadata(), {
    name: "rsql-mongodb",
    language: "rsql",
    target: "mongodb",
    version: "0.1.0",
    description: "Converts RSQL filters to MongoDB filter objects.",
  });
});

test("converts equality and AND expressions", () => {
  const adapter = createAdapter();
  const result = adapter.convert({
    query: "level==error;host==api-01",
    options: { allowedFields },
  });

  assert.deepEqual(result.filter, {
    $and: [
      { level: "error" },
      { "metadata.host": "api-01" },
    ],
  });
});

test("converts OR expressions", () => {
  const adapter = createAdapter();
  const result = adapter.convert({
    query: "level==error,level==critical",
    options: { allowedFields },
  });

  assert.deepEqual(result.filter, {
    $or: [
      { level: "error" },
      { level: "critical" },
    ],
  });
});

test("converts list operators", () => {
  const adapter = createAdapter();
  const result = adapter.convert({
    query: "level=in=(error,critical)",
    options: { allowedFields },
  });

  assert.deepEqual(result.filter, {
    level: {
      $in: ["error", "critical"],
    },
  });
});

test("casts number values", () => {
  const adapter = createAdapter();
  const result = adapter.convert({
    query: "statusCode>=500",
    options: { allowedFields },
  });

  assert.deepEqual(result.filter, {
    statusCode: {
      $gte: 500,
    },
  });
});

test("casts date values", () => {
  const adapter = createAdapter();
  const result = adapter.convert({
    query: "timestamp>=2026-04-25T00:00:00Z",
    options: { allowedFields },
  });

  assert.ok(result.filter.timestamp.$gte instanceof Date);
  assert.equal(result.filter.timestamp.$gte.toISOString(), "2026-04-25T00:00:00.000Z");
});

test("rejects unknown fields", () => {
  const adapter = createAdapter();

  assert.throws(
    () => adapter.convert({ query: "unknown==value", options: { allowedFields } }),
    /Field is not allowed/,
  );
});

test("rejects unsafe fields", () => {
  const adapter = createAdapter();

  assert.throws(
    () =>
      adapter.convert({
        query: "$where==this.password",
        options: {
          allowedFields: {
            $where: {
              type: "string",
              operators: ["=="],
            },
          },
        },
      }),
    /Unsafe field/,
  );
});

test("rejects operators not allowed for the field", () => {
  const adapter = createAdapter();

  assert.throws(
    () => adapter.convert({ query: "level=contains=err", options: { allowedFields } }),
    /Operator =contains= is not allowed/,
  );
});
