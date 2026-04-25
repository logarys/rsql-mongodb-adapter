export type RsqlNode = RsqlLogicalNode | RsqlComparisonNode;

export interface RsqlLogicalNode {
  kind: "logical";
  operator: "and" | "or";
  children: RsqlNode[];
}

export interface RsqlComparisonNode {
  kind: "comparison";
  selector: string;
  operator: string;
  arguments: string[];
}
