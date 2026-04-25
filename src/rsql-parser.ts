import type { RsqlComparisonNode, RsqlNode } from "./ast.js";

const COMPARISON_OPERATORS = [
  "=contains=",
  "=starts=",
  "=ends=",
  "=exists=",
  "=regex=",
  "=out=",
  "=in=",
  "=ge=",
  "=gt=",
  "=le=",
  "=lt=",
  ">=",
  "<=",
  "==",
  "!=",
  ">",
  "<",
] as const;

export class RsqlSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RsqlSyntaxError";
  }
}

export function parseRsql(source: string): RsqlNode {
  const query = source.trim();

  if (!query) {
    throw new RsqlSyntaxError("RSQL query cannot be empty.");
  }

  return parseExpression(query);
}

function parseExpression(source: string): RsqlNode {
  const withoutOuterParentheses = stripOuterParentheses(source.trim());
  const orParts = splitTopLevel(withoutOuterParentheses, ",");

  if (orParts.length > 1) {
    return {
      kind: "logical",
      operator: "or",
      children: orParts.map(parseExpression),
    };
  }

  const andParts = splitTopLevel(withoutOuterParentheses, ";");

  if (andParts.length > 1) {
    return {
      kind: "logical",
      operator: "and",
      children: andParts.map(parseExpression),
    };
  }

  return parseComparison(withoutOuterParentheses);
}

function parseComparison(source: string): RsqlComparisonNode {
  const match = findComparisonOperator(source);

  if (!match) {
    throw new RsqlSyntaxError(`Invalid RSQL comparison: ${source}`);
  }

  const selector = source.slice(0, match.index).trim();
  const rawArguments = source.slice(match.index + match.operator.length).trim();

  if (!selector) {
    throw new RsqlSyntaxError(`Missing selector in comparison: ${source}`);
  }

  if (!rawArguments) {
    throw new RsqlSyntaxError(`Missing value in comparison: ${source}`);
  }

  return {
    kind: "comparison",
    selector,
    operator: match.operator,
    arguments: parseArguments(rawArguments),
  };
}

function findComparisonOperator(
  source: string,
): { operator: string; index: number } | null {
  let quote: string | null = null;
  let depth = 0;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (char === "\\") {
        index += 1;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === "(") {
      depth += 1;
      continue;
    }

    if (char === ")") {
      depth -= 1;
      continue;
    }

    if (depth !== 0) {
      continue;
    }

    for (const operator of COMPARISON_OPERATORS) {
      if (source.startsWith(operator, index)) {
        return { operator, index };
      }
    }
  }

  return null;
}

function parseArguments(source: string): string[] {
  const value = source.trim();

  if (
    value.startsWith("(") &&
    value.endsWith(")") &&
    hasBalancedOuterParentheses(value)
  ) {
    const inside = value.slice(1, -1);
    return splitTopLevel(inside, ",").map(unquoteValue);
  }

  return [unquoteValue(value)];
}

function splitTopLevel(source: string, separator: string): string[] {
  const parts: string[] = [];
  let quote: string | null = null;
  let depth = 0;
  let start = 0;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (char === "\\") {
        index += 1;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === "(") {
      depth += 1;
      continue;
    }

    if (char === ")") {
      depth -= 1;
      if (depth < 0) {
        throw new RsqlSyntaxError(
          `Unexpected closing parenthesis in: ${source}`,
        );
      }
      continue;
    }

    if (depth === 0 && char === separator) {
      const part = source.slice(start, index).trim();
      if (!part) {
        throw new RsqlSyntaxError(
          `Empty expression around '${separator}' in: ${source}`,
        );
      }
      parts.push(part);
      start = index + 1;
    }
  }

  if (quote) {
    throw new RsqlSyntaxError(`Unclosed quote in: ${source}`);
  }

  if (depth !== 0) {
    throw new RsqlSyntaxError(`Unbalanced parentheses in: ${source}`);
  }

  const last = source.slice(start).trim();

  if (!last) {
    throw new RsqlSyntaxError(
      `Empty expression around '${separator}' in: ${source}`,
    );
  }

  parts.push(last);

  return parts;
}

function stripOuterParentheses(source: string): string {
  let current = source;

  while (
    current.startsWith("(") &&
    current.endsWith(")") &&
    hasBalancedOuterParentheses(current)
  ) {
    current = current.slice(1, -1).trim();
  }

  return current;
}

function hasBalancedOuterParentheses(source: string): boolean {
  let quote: string | null = null;
  let depth = 0;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (char === "\\") {
        index += 1;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === "(") {
      depth += 1;
    }

    if (char === ")") {
      depth -= 1;
      if (depth === 0 && index < source.length - 1) {
        return false;
      }
    }

    if (depth < 0) {
      return false;
    }
  }

  return depth === 0 && !quote;
}

function unquoteValue(source: string): string {
  const value = source.trim();
  const first = value[0];
  const last = value[value.length - 1];

  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1).replace(/\\([\\"'])/g, "$1");
  }

  return value;
}
