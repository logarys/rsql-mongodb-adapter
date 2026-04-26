import assert from "node:assert/strict";
import { test } from "node:test";
import { createAdapter, parseRsql, RsqlSyntaxError } from "../dist/index.js";

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
  service: {
    type: "string",
    mongoPath: "context.service",
    operators: ["==", "!="],
  },
  timestamp: { type: "date", operators: [">", ">=", "<", "<="] },
  statusCode: {
    type: "number",
    operators: ["==", "!=", ">", ">=", "<", "<=", "=gt=", "=ge=", "=lt=", "=le=", "=in=", "=out="],
  },
  archived: { type: "boolean", operators: ["==", "!=", "=exists="] },
  tags: { type: "array", operators: ["==", "!=", "=in=", "=out="] },
};

function convert(query, fields = allowedFields) {
  return createAdapter().convert({ query, options: { allowedFields: fields } }).filter;
}

function iso(value) {
  return new Date(value).toISOString();
}

function assertDateFilter(actual, field, operator, expectedIso) {
  assert.ok(actual[field][operator] instanceof Date);
  assert.equal(actual[field][operator].toISOString(), expectedIso);
}

test("exports a standard adapter factory and metadata", () => {
  const adapter = createAdapter();
  assert.equal(adapter.supports("rsql", "mongodb"), true);
  assert.equal(adapter.supports("sql", "mongodb"), false);
  assert.equal(adapter.supports("rsql", "elasticsearch"), false);

  assert.deepEqual(adapter.getMetadata(), {
    name: "rsql-mongodb",
    language: "rsql",
    target: "mongodb",
    version: "0.1.1-patched.1",
    description: "Converts RSQL filters to MongoDB filter objects.",
  });
});

test("parses and converts a simple equality", () => {
  assert.deepEqual(convert("level==error"), { level: "error" });
});

test("converts not-equal", () => {
  assert.deepEqual(convert("level!=debug"), { level: { $ne: "debug" } });
});

test("converts equality and AND expressions", () => {
  assert.deepEqual(convert("level==error;host==api-01"), {
    $and: [{ level: "error" }, { "metadata.host": "api-01" }],
  });
});

test("converts OR expressions", () => {
  assert.deepEqual(convert("level==error,level==critical"), {
    $or: [{ level: "error" }, { level: "critical" }],
  });
});

test("keeps RSQL precedence: OR splits before AND in this parser", () => {
  assert.deepEqual(convert("level==error;host==api-01,level==critical"), {
    $or: [
      {
        $and: [{ level: "error" }, { "metadata.host": "api-01" }],
      },
      { level: "critical" },
    ],
  });
});

test("converts grouped expressions with parentheses", () => {
  assert.deepEqual(convert("level==error;(host==api-01,host==api-02)"), {
    $and: [
      { level: "error" },
      {
        $or: [{ "metadata.host": "api-01" }, { "metadata.host": "api-02" }],
      },
    ],
  });
});

test("converts nested grouped expressions", () => {
  assert.deepEqual(
    convert("(level==error,level==critical);(host==api-01,host==api-02)"),
    {
      $and: [
        { $or: [{ level: "error" }, { level: "critical" }] },
        { $or: [{ "metadata.host": "api-01" }, { "metadata.host": "api-02" }] },
      ],
    },
  );
});

test("uses targetPath when provided", () => {
  assert.deepEqual(convert("host==api-01"), { "metadata.host": "api-01" });
});

test("uses mongoPath when targetPath is not provided", () => {
  assert.deepEqual(convert("service==catalog"), { "context.service": "catalog" });
});

test("targetPath has priority over mongoPath", () => {
  const fields = {
    host: {
      type: "string",
      targetPath: "metadata.host",
      mongoPath: "legacy.host",
      operators: ["=="],
    },
  };

  assert.deepEqual(convert("host==api-01", fields), { "metadata.host": "api-01" });
});

test("keeps non-wildcard equality unchanged", () => {
  assert.deepEqual(convert("message==Synthetic"), { message: "Synthetic" });
});

test("converts equality wildcard to escaped regex", () => {
  assert.deepEqual(convert("message==*098*"), {
    message: { $regex: "^.*098.*$", $options: "i" },
  });
});

test("converts prefix wildcard", () => {
  assert.deepEqual(convert("message==*098"), {
    message: { $regex: "^.*098$", $options: "i" },
  });
});

test("converts suffix wildcard", () => {
  assert.deepEqual(convert("message==ERR*"), {
    message: { $regex: "^ERR.*$", $options: "i" },
  });
});

test("converts multiple wildcard segments", () => {
  assert.deepEqual(convert("message==*error*099*"), {
    message: { $regex: "^.*error.*099.*$", $options: "i" },
  });
});

test("converts equality wildcard and escapes regex characters", () => {
  assert.deepEqual(convert("message==*log[098].txt*"), {
    message: { $regex: "^.*log\\[098\\]\\.txt.*$", $options: "i" },
  });
});

test("converts not-equal wildcard to negative regex", () => {
  assert.deepEqual(convert("message!=*debug*"), {
    message: { $not: { $regex: "^.*debug.*$", $options: "i" } },
  });
});

test("does not convert wildcard on non-string fields", () => {
  const fields = { value: { type: "array", operators: ["=="] } };
  assert.deepEqual(convert("value==*debug*", fields), { value: ["*debug*"] });
});

test("converts contains to case-insensitive escaped regex", () => {
  assert.deepEqual(convert("message=contains=log[099]"), {
    message: { $regex: "log\\[099\\]", $options: "i" },
  });
});

test("converts starts to anchored regex", () => {
  assert.deepEqual(convert("message=starts=Synthetic"), {
    message: { $regex: "^Synthetic", $options: "i" },
  });
});

test("converts ends to anchored regex", () => {
  assert.deepEqual(convert("message=ends=#099"), {
    message: { $regex: "#099$", $options: "i" },
  });
});

test("converts regex operator without escaping", () => {
  assert.deepEqual(convert("message=regex=^Synthetic.*099$"), {
    message: { $regex: "^Synthetic.*099$", $options: "i" },
  });
});

test("converts in list operator", () => {
  assert.deepEqual(convert("level=in=(error,critical)"), {
    level: { $in: ["error", "critical"] },
  });
});

test("converts out list operator", () => {
  assert.deepEqual(convert("level=out=(debug,info)"), {
    level: { $nin: ["debug", "info"] },
  });
});

test("converts list operator values through target path", () => {
  assert.deepEqual(convert("host=in=(api-01,api-02)"), {
    "metadata.host": { $in: ["api-01", "api-02"] },
  });
});

test("preserves quoted separators in list values", () => {
  assert.deepEqual(convert('level=in=("error,critical","warning;debug")'), {
    level: { $in: ["error,critical", "warning;debug"] },
  });
});

test("unquotes single and double quoted values", () => {
  assert.deepEqual(convert('message=="hello world"'), { message: "hello world" });
  assert.deepEqual(convert("message=='hello world'"), { message: "hello world" });
});

test("unescapes quoted quote characters", () => {
  assert.deepEqual(convert('message=="hello \\\"world\\\""'), {
    message: 'hello "world"',
  });
  assert.deepEqual(convert("message=='it\\'s ok'"), { message: "it's ok" });
});

test("casts number equality", () => {
  assert.deepEqual(convert("statusCode==500"), { statusCode: 500 });
});

test("casts number inequality", () => {
  assert.deepEqual(convert("statusCode!=404"), { statusCode: { $ne: 404 } });
});

test("casts number comparison operators", () => {
  assert.deepEqual(convert("statusCode>499"), { statusCode: { $gt: 499 } });
  assert.deepEqual(convert("statusCode>=500"), { statusCode: { $gte: 500 } });
  assert.deepEqual(convert("statusCode<600"), { statusCode: { $lt: 600 } });
  assert.deepEqual(convert("statusCode<=599"), { statusCode: { $lte: 599 } });
});

test("normalizes symbolic named comparison operators", () => {
  assert.deepEqual(convert("statusCode=gt=499"), { statusCode: { $gt: 499 } });
  assert.deepEqual(convert("statusCode=ge=500"), { statusCode: { $gte: 500 } });
  assert.deepEqual(convert("statusCode=lt=600"), { statusCode: { $lt: 600 } });
  assert.deepEqual(convert("statusCode=le=599"), { statusCode: { $lte: 599 } });
});

test("casts number in and out list values", () => {
  assert.deepEqual(convert("statusCode=in=(200,201,204)"), {
    statusCode: { $in: [200, 201, 204] },
  });
  assert.deepEqual(convert("statusCode=out=(400,404,500)"), {
    statusCode: { $nin: [400, 404, 500] },
  });
});

test("casts date comparison operators", () => {
  const gte = convert("timestamp>=2026-04-25T00:00:00Z");
  assertDateFilter(gte, "timestamp", "$gte", "2026-04-25T00:00:00.000Z");

  const gt = convert("timestamp>2026-04-25T00:00:00Z");
  assertDateFilter(gt, "timestamp", "$gt", "2026-04-25T00:00:00.000Z");

  const lte = convert("timestamp<=2026-04-25T23:59:59Z");
  assertDateFilter(lte, "timestamp", "$lte", "2026-04-25T23:59:59.000Z");

  const lt = convert("timestamp<2026-04-26T00:00:00Z");
  assertDateFilter(lt, "timestamp", "$lt", "2026-04-26T00:00:00.000Z");
});

test("casts boolean equality and inequality", () => {
  assert.deepEqual(convert("archived==true"), { archived: true });
  assert.deepEqual(convert("archived==false"), { archived: false });
  assert.deepEqual(convert("archived!=true"), { archived: { $ne: true } });
});

test("converts exists true and false", () => {
  assert.deepEqual(convert("archived=exists=true"), {
    archived: { $exists: true },
  });
  assert.deepEqual(convert("archived=exists=false"), {
    archived: { $exists: false },
  });
});

test("casts array values", () => {
  assert.deepEqual(convert("tags==backend"), { tags: ["backend"] });
  assert.deepEqual(convert("tags!=frontend"), { tags: { $ne: ["frontend"] } });
  assert.deepEqual(convert("tags=in=(backend,api)"), {
    tags: { $in: [["backend"], ["api"]] },
  });
});

test("parseRsql returns comparison AST", () => {
  assert.deepEqual(parseRsql("level==error"), {
    kind: "comparison",
    selector: "level",
    operator: "==",
    arguments: ["error"],
  });
});

test("parseRsql returns logical AST", () => {
  assert.deepEqual(parseRsql("level==error,level==critical"), {
    kind: "logical",
    operator: "or",
    children: [
      { kind: "comparison", selector: "level", operator: "==", arguments: ["error"] },
      { kind: "comparison", selector: "level", operator: "==", arguments: ["critical"] },
    ],
  });
});

test("rejects empty RSQL", () => {
  assert.throws(() => parseRsql("   "), RsqlSyntaxError);
});

test("rejects invalid comparison", () => {
  assert.throws(() => parseRsql("level"), /Invalid RSQL comparison/);
});

test("rejects missing selector", () => {
  assert.throws(() => parseRsql("==error"), /Missing selector/);
});

test("rejects missing value", () => {
  assert.throws(() => parseRsql("level=="), /Missing value/);
});

test("rejects empty expressions around AND and OR separators", () => {
  assert.throws(() => parseRsql("level==error;"), /Empty expression/);
  assert.throws(() => parseRsql("level==error,"), /Empty expression/);
});

test("rejects unclosed quotes", () => {
  assert.throws(() => parseRsql('message=="unterminated'), /Unclosed quote/);
});

test("rejects unbalanced parentheses", () => {
  assert.throws(() => parseRsql("(level==error"), /Unbalanced parentheses|Invalid RSQL comparison/);
  assert.throws(() => parseRsql("level==error)"), /Unexpected closing parenthesis|Invalid RSQL comparison/);
});

test("rejects unknown fields", () => {
  assert.throws(
    () => convert("unknown==value"),
    /Field is not allowed: unknown/,
  );
});

test("rejects unsafe fields", () => {
  assert.throws(
    () => convert("$where==value", { $where: { type: "string", operators: ["=="] } }),
    /Unsafe field/,
  );

  assert.throws(
    () => convert("__proto__==value", { __proto__: { type: "string", operators: ["=="] } }),
    /Unsafe field/,
  );

  assert.throws(
    () => convert("constructor==value", { constructor: { type: "string", operators: ["=="] } }),
    /Unsafe field/,
  );

  assert.throws(
    () => convert("prototype==value", { prototype: { type: "string", operators: ["=="] } }),
    /Unsafe field/,
  );
});

test("rejects operators not allowed by field definition", () => {
  assert.throws(() => convert("level=contains=err"), /Operator =contains= is not allowed for field level/);
});

test("rejects invalid number values", () => {
  assert.throws(() => convert("statusCode==abc"), /Invalid number value/);
});

test("rejects invalid boolean values", () => {
  assert.throws(() => convert("archived==yes"), /Invalid boolean value/);
});

test("rejects invalid date values", () => {
  assert.throws(() => convert("timestamp>=not-a-date"), /Invalid date value/);
});
