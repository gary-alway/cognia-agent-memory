import { randomUUID } from "crypto";
import type { ManagedTransaction, Record as Neo4jRecord } from "neo4j-driver";
import { RETRIEVAL_LIMITS } from "../core/constants.js";
import { getRecords } from "../core/neo4j-helpers.js";

export interface ToolCall {
  id: string;
  name: string;
  args: string;
  status: string;
  latency?: number;
  result?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ToolPattern {
  id: string;
  args: string;
  latency?: number;
  context: string;
}

export interface FailedThenSuccessfulPattern {
  failedArgs: string;
  successArgs: string;
  failedContext: string;
  successContext: string;
}

export function storeToolCall(
  tx: ManagedTransaction,
  messageId: string,
  toolName: string,
  args: Record<string, unknown>,
  status: string = "pending",
  latencyMs?: number,
  result?: string,
): string {
  const toolCallId = randomUUID();

  tx.run(
    `
    CREATE (t:ToolCall {
        id: $tool_call_id,
        name: $name,
        args: $args,
        status: $status,
        latency: $latency,
        result: $result,
        createdAt: datetime()
    })
    WITH t
    MATCH (m:Message {id: $message_id})
    MERGE (m)-[:USED_TOOL]->(t)
    `,
    {
      tool_call_id: toolCallId,
      name: toolName,
      args: JSON.stringify(args),
      status: status,
      latency: latencyMs,
      result: result,
      message_id: messageId,
    },
  );

  return toolCallId;
}

export function updateToolCallStatus(
  tx: ManagedTransaction,
  toolCallId: string,
  status: string,
  latencyMs?: number,
  result?: string,
): void {
  tx.run(
    `
    MATCH (t:ToolCall {id: $tool_call_id})
    SET t.status = $status,
        t.latency = coalesce($latency, t.latency),
        t.result = coalesce($result, t.result),
        t.updatedAt = datetime()
    `,
    {
      tool_call_id: toolCallId,
      status: status,
      latency: latencyMs,
      result: result,
    },
  );
}

export function linkToolResultToMessage(
  tx: ManagedTransaction,
  toolCallId: string,
  resultMessageId: string,
): void {
  tx.run(
    `
    MATCH (t:ToolCall {id: $tool_call_id})
    MATCH (m:Message {id: $result_message_id})
    MERGE (t)-[:RESULTED_IN]->(m)
    `,
    {
      tool_call_id: toolCallId,
      result_message_id: resultMessageId,
    },
  );
}

export function getSuccessfulToolPatterns(
  tx: ManagedTransaction,
  toolName: string,
  limit: number = RETRIEVAL_LIMITS.DEFAULT_TOOL_PATTERNS,
): ToolPattern[] {
  const result = tx.run(
    `
    MATCH (m:Message)-[:USED_TOOL]->(t:ToolCall {name: $tool_name, status: 'success'})
    RETURN t.id AS id,
           t.args AS args,
           t.latency AS latency,
           m.text AS context
    ORDER BY t.createdAt DESC
    LIMIT $limit
    `,
    {
      tool_name: toolName,
      limit: limit,
    },
  );

  const records = getRecords<Neo4jRecord>(result);
  return records.map((record: Neo4jRecord) => ({
    id: record.get("id") as string,
    args: record.get("args") as string,
    latency: record.get("latency")
      ? (record.get("latency") as { toNumber(): number }).toNumber()
      : undefined,
    context: record.get("context") as string,
  }));
}

export function getFailedThenSuccessfulPatterns(
  tx: ManagedTransaction,
  toolName: string,
): FailedThenSuccessfulPattern[] {
  const result = tx.run(
    `
    MATCH (m1:Message)-[:USED_TOOL]->(t1:ToolCall {name: $tool_name, status: 'failed'})
    MATCH (m1)-[:HAS_MESSAGE*1..3]-(m2:Message)-[:USED_TOOL]->(t2:ToolCall {name: $tool_name, status: 'success'})
    WHERE t1.createdAt < t2.createdAt
    RETURN t1.args AS failed_args,
           t2.args AS success_args,
           m1.text AS failed_context,
           m2.text AS success_context
    LIMIT ${RETRIEVAL_LIMITS.FAILED_SUCCESS_PATTERNS}
    `,
    { tool_name: toolName },
  );

  const records = getRecords<Neo4jRecord>(result);
  return records.map((record: Neo4jRecord) => ({
    failedArgs: record.get("failed_args") as string,
    successArgs: record.get("success_args") as string,
    failedContext: record.get("failed_context") as string,
    successContext: record.get("success_context") as string,
  }));
}
