import type {
  FieldDefinition,
  FieldDefinitions,
  QueryAdapter,
  QueryAdapterInput,
  QueryAdapterMetadata,
  QueryAdapterResult,
} from "@logarys/query-adapter-contracts";
import type { RsqlComparisonNode, RsqlNode } from "./ast.js";
import { parseRsql } from "./rsql-parser.js";

export interface RsqlMongoDbAdapterConfig {
  metadata?: Partial<QueryAdapterMetadata>;
}

type MongoFilter = Record<string, unknown>;

export class RsqlMongoDbAdapter implements QueryAdapter {
  constructor(private readonly config: RsqlMongoDbAdapterConfig = {}) {}

  getMetadata(): QueryAdapterMetadata {
    return {
      name: this.config.metadata?.name ?? "rsql-mongodb",
      language: this.config.metadata?.language ?? "rsql",
      target: this.config.metadata?.target ?? "mongodb",
      version: this.config.metadata?.version ?? "0.1.1-patched.1",
      description:
        this.config.metadata?.description ??
        "Converts RSQL filters to MongoDB filter objects.",
    };
  }

  supports(language: string, target: string): boolean {
    return language === "rsql" && target === "mongodb";
  }

  convert(input: QueryAdapterInput): QueryAdapterResult {
    const ast = parseRsql(input.query);
    const allowedFields = input.options?.allowedFields ?? {};

    return {
      filter: this.convertNode(ast, allowedFields),
    };
  }

  private convertNode(
    node: RsqlNode,
    allowedFields: FieldDefinitions,
  ): MongoFilter {
    if (node.kind === "logical") {
      return {
        [node.operator === "and" ? "$and" : "$or"]: node.children.map((child) =>
          this.convertNode(child, allowedFields),
        ),
      };
    }

    return this.convertComparison(node, allowedFields);
  }

  private convertComparison(
    node: RsqlComparisonNode,
    allowedFields: FieldDefinitions,
  ): MongoFilter {
    const field = node.selector;
    this.assertSafeField(field);

    const definition = allowedFields[field];

    if (!definition) {
      throw new Error(`Field is not allowed: ${field}`);
    }

    const operator = normalizeOperator(node.operator);
    this.assertAllowedOperator(field, operator, definition);

    const mongoPath = definition.targetPath ?? definition.mongoPath ?? field;
    const values = node.arguments.map((value) =>
      this.castValue(value, definition),
    );
    const firstValue = values[0];

    switch (operator) {
      case "==":
        return this.convertEquality(mongoPath, firstValue, definition);
      case "!=":
        return this.convertNotEquality(mongoPath, firstValue, definition);
      case ">":
        return { [mongoPath]: { $gt: firstValue } };
      case ">=":
        return { [mongoPath]: { $gte: firstValue } };
      case "<":
        return { [mongoPath]: { $lt: firstValue } };
      case "<=":
        return { [mongoPath]: { $lte: firstValue } };
      case "=in=":
        return { [mongoPath]: { $in: values } };
      case "=out=":
        return { [mongoPath]: { $nin: values } };
      case "=contains=":
        return {
          [mongoPath]: {
            $regex: escapeRegex(String(firstValue)),
            $options: "i",
          },
        };
      case "=starts=":
        return {
          [mongoPath]: {
            $regex: `^${escapeRegex(String(firstValue))}`,
            $options: "i",
          },
        };
      case "=ends=":
        return {
          [mongoPath]: {
            $regex: `${escapeRegex(String(firstValue))}$`,
            $options: "i",
          },
        };
      case "=exists=":
        return {
          [mongoPath]: {
            $exists: firstValue === true || firstValue === "true",
          },
        };
      case "=regex=":
        return { [mongoPath]: { $regex: String(firstValue), $options: "i" } };
      default:
        throw new Error(`Unsupported RSQL operator: ${operator}`);
    }
  }

  private convertEquality(
    mongoPath: string,
    value: unknown,
    definition: FieldDefinition,
  ): MongoFilter {
    if (this.shouldUseWildcardRegex(value, definition)) {
      return { [mongoPath]: wildcardRegexFilter(String(value)) };
    }

    return { [mongoPath]: value };
  }

  private convertNotEquality(
    mongoPath: string,
    value: unknown,
    definition: FieldDefinition,
  ): MongoFilter {
    if (this.shouldUseWildcardRegex(value, definition)) {
      return { [mongoPath]: { $not: wildcardRegexFilter(String(value)) } };
    }

    return { [mongoPath]: { $ne: value } };
  }

  private shouldUseWildcardRegex(
    value: unknown,
    definition: FieldDefinition,
  ): boolean {
    return (
      definition.type === "string" &&
      typeof value === "string" &&
      value.includes("*")
    );
  }

  private assertSafeField(field: string): void {
    if (
      field.startsWith("$") ||
      field.includes("__proto__") ||
      field.includes("constructor") ||
      field.includes("prototype")
    ) {
      throw new Error(`Unsafe field: ${field}`);
    }
  }

  private assertAllowedOperator(
    field: string,
    operator: string,
    definition: FieldDefinition,
  ): void {
    if (definition.operators && !definition.operators.includes(operator)) {
      throw new Error(`Operator ${operator} is not allowed for field ${field}`);
    }
  }

  private castValue(value: string, definition: FieldDefinition): unknown {
    switch (definition.type) {
      case "number": {
        const parsed = Number(value);
        if (Number.isNaN(parsed)) {
          throw new Error(`Invalid number value: ${value}`);
        }
        return parsed;
      }
      case "boolean":
        if (value === "true") {
          return true;
        }
        if (value === "false") {
          return false;
        }
        throw new Error(`Invalid boolean value: ${value}`);
      case "date": {
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
          throw new Error(`Invalid date value: ${value}`);
        }
        return parsed;
      }
      case "array":
        return [value];
      case "string":
      default:
        return value;
    }
  }
}

function normalizeOperator(operator: string): string {
  switch (operator) {
    case "=gt=":
      return ">";
    case "=ge=":
      return ">=";
    case "=lt=":
      return "<";
    case "=le=":
      return "<=";
    default:
      return operator;
  }
}

function wildcardRegexFilter(value: string): {
  $regex: string;
  $options: string;
} {
  return {
    $regex: `^${wildcardToRegex(value)}$`,
    $options: "i",
  };
}

function wildcardToRegex(value: string): string {
  return value.split("*").map(escapeRegex).join(".*");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
