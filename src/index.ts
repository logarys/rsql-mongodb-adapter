import type { QueryAdapter } from "@logarys/query-adapter-contracts";
import { RsqlMongoDbAdapter } from "./rsql-mongodb-adapter.js";

export function createAdapter(): QueryAdapter {
  return new RsqlMongoDbAdapter();
}

export { RsqlMongoDbAdapter } from "./rsql-mongodb-adapter.js";
export type { RsqlMongoDbAdapterConfig } from "./rsql-mongodb-adapter.js";
export { parseRsql, RsqlSyntaxError } from "./rsql-parser.js";
export type { RsqlComparisonNode, RsqlLogicalNode, RsqlNode } from "./ast.js";
