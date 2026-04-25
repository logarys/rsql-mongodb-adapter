# Contributing to @logarys/rsql-mongodb-adapter

Thank you for contributing to Logarys.

This package provides the official RSQL to MongoDB adapter for the Logarys query adapter system.

## Project goals

The adapter must stay:

- small and easy to audit;
- safe by default;
- independent from `logarys-console-manager`;
- compatible with the `@logarys/query-adapter-contracts` package;
- predictable in the MongoDB filters it generates.

## Local setup

```bash
git clone https://github.com/logarys/rsql-mongodb-adapter.git
cd rsql-mongodb-adapter
npm install
npm run build
npm test
```

If `@logarys/query-adapter-contracts` is not published yet, install it locally first:

```bash
npm install ../query-adapter-contracts
```

## Development commands

```bash
npm run build
npm run lint
npm test
```

## Adapter contract

The package must always export this function:

```ts
export function createAdapter(): QueryAdapter;
```

`logarys-console-manager` uses this function to dynamically load the adapter.

## Supported behavior

Contributions should preserve the existing mapping:

| RSQL | MongoDB |
| --- | --- |
| `==` | equality |
| `!=` | `$ne` |
| `>` | `$gt` |
| `>=` | `$gte` |
| `<` | `$lt` |
| `<=` | `$lte` |
| `=in=` | `$in` |
| `=out=` | `$nin` |
| `;` | `$and` |
| `,` | `$or` |

Additional operators may be added when they are useful for logs and safe to execute.

## Security rules

Do not add features that allow users to send raw MongoDB query fragments.

The adapter must keep rejecting:

- unknown fields;
- fields starting with `$`;
- `__proto__`;
- `constructor`;
- `prototype`;
- operators not allowed by the field definition.

Any change involving regex, dynamic paths or operator mapping must include tests.

## Code style

- Use TypeScript strict mode.
- Keep comments in English.
- Prefer small functions.
- Avoid runtime dependencies unless they provide a clear benefit.
- Do not couple this package to NestJS.

## Tests

Add tests for every new operator or parser behavior.

Good test cases include:

- simple comparisons;
- `AND` / `OR` combinations;
- parentheses;
- list operators;
- invalid fields;
- invalid values;
- unsafe field names.

Run tests with:

```bash
npm test
```

## Commit messages

Use clear commit messages:

```txt
Add support for starts operator
Fix date casting validation
Reject unsafe selector names
```

## Pull request checklist

Before opening a pull request:

- [ ] `npm run build` passes;
- [ ] `npm test` passes;
- [ ] README is updated if public behavior changed;
- [ ] security-sensitive changes include tests;
- [ ] generated MongoDB filters are deterministic.

## Release process

Update the version in `package.json`, then publish:

```bash
npm publish --access public
```

## License

By contributing, you agree that your contribution is released under the MIT license.
