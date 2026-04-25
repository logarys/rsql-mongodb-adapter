# @logarys/rsql-mongodb-adapter

RSQL to MongoDB query adapter for the Logarys query adapter system.

This package implements the Logarys `QueryAdapter` contract and converts an RSQL filter string into a MongoDB-compatible filter object.

It is designed to be loaded by `logarys-console-manager` either as an installed npm package or as an external adapter package loaded from a Git repository.

## Installation

```bash
npm install @logarys/rsql-mongodb-adapter
```

This package depends on:

```bash
npm install @logarys/query-adapter-contracts
```

## Purpose

The adapter receives this kind of input:

```txt
level==error;host==api-01
```

And returns this MongoDB filter:

```ts
{
  $and: [{ level: "error" }, { host: "api-01" }];
}
```

## Standard adapter export

The package exports a `createAdapter()` function:

```ts
import { createAdapter } from "@logarys/rsql-mongodb-adapter";

const adapter = createAdapter();
```

This is the standard entrypoint expected by `logarys-console-manager` when dynamically loading adapters.

## Basic usage

```ts
import { createAdapter } from "@logarys/rsql-mongodb-adapter";

const adapter = createAdapter();

const result = adapter.convert({
  query: "level==error;host==api-01",
  options: {
    allowedFields: {
      level: {
        type: "string",
        operators: ["==", "!=", "=in=", "=out="],
      },
      host: {
        type: "string",
        operators: ["==", "!=", "=contains=", "=in=", "=out="],
      },
    },
  },
});

console.log(result.filter);
```

Output:

```ts
{
  $and: [{ level: "error" }, { host: "api-01" }];
}
```

## Supported RSQL operators

| RSQL operator | MongoDB output                           |
| ------------- | ---------------------------------------- |
| `==`          | equality                                 |
| `!=`          | `$ne`                                    |
| `>` / `=gt=`  | `$gt`                                    |
| `>=` / `=ge=` | `$gte`                                   |
| `<` / `=lt=`  | `$lt`                                    |
| `<=` / `=le=` | `$lte`                                   |
| `=in=`        | `$in`                                    |
| `=out=`       | `$nin`                                   |
| `=contains=`  | escaped case-insensitive `$regex`        |
| `=starts=`    | escaped case-insensitive prefix `$regex` |
| `=ends=`      | escaped case-insensitive suffix `$regex` |
| `=exists=`    | `$exists`                                |
| `=regex=`     | raw case-insensitive `$regex`            |

## Logical operators

RSQL `;` is converted to MongoDB `$and`:

```txt
level==error;host==api-01
```

```ts
{
  $and: [{ level: "error" }, { host: "api-01" }];
}
```

RSQL `,` is converted to MongoDB `$or`:

```txt
level==error,level==critical
```

```ts
{
  $or: [{ level: "error" }, { level: "critical" }];
}
```

Parentheses are supported:

```txt
(level==error,level==critical);host==api-01
```

## Field whitelist

The adapter refuses unknown fields by default. Every usable field must be explicitly declared in `allowedFields`.

```ts
const result = adapter.convert({
  query: "timestamp>=2026-04-25T00:00:00Z;level=in=(error,critical)",
  options: {
    allowedFields: {
      timestamp: {
        type: "date",
        operators: [">", ">=", "<", "<="],
      },
      level: {
        type: "string",
        operators: ["==", "!=", "=in=", "=out="],
      },
    },
  },
});
```

## Mapping logical fields to MongoDB paths

You can expose a logical field to users and map it to a physical MongoDB path.

```ts
const result = adapter.convert({
  query: "host==api-01",
  options: {
    allowedFields: {
      host: {
        type: "string",
        targetPath: "metadata.host",
        operators: ["==", "!=", "=in="],
      },
    },
  },
});
```

Output:

```ts
{
  "metadata.host": "api-01"
}
```

`mongoPath` is also supported as a backward-compatible alias.

## Type casting

Values are cast according to the field definition:

| Field type | Example input          | Output value |
| ---------- | ---------------------- | ------------ |
| `string`   | `error`                | `"error"`    |
| `number`   | `500`                  | `500`        |
| `boolean`  | `true`                 | `true`       |
| `date`     | `2026-04-25T00:00:00Z` | `Date`       |

## Security model

The adapter intentionally does not expose MongoDB query syntax directly.

It protects the application by:

- requiring a whitelist of allowed fields;
- blocking unsafe field names such as `$where`, `__proto__`, `constructor` and `prototype`;
- checking allowed operators per field;
- escaping regex values for `=contains=`, `=starts=` and `=ends=`;
- keeping raw MongoDB filters internal to the backend.

Use `=regex=` only for trusted users or restricted fields.

## Build

```bash
npm run build
```

## Test

```bash
npm test
```

## Publish

```bash
npm publish --access public
```

## License

MIT
