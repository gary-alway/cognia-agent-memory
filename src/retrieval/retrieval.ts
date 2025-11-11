import type {
  ManagedTransaction,
  Record as Neo4jRecord,
  Session,
} from "neo4j-driver";
import { EMBEDDING_DIMENSION } from "../core/config.js";
import { DEFAULT_IMPORTANCE, RETRIEVAL_LIMITS } from "../core/constants.js";
import { getLogger } from "../core/logger.js";
import { getRecordsAsync } from "../core/neo4j-helpers.js";
import {
  validateEmbedding,
  validatePositiveInteger,
} from "../core/validation.js";

const logger = getLogger("retrieval");

export interface RetrievedMessage {
  id: string;
  text: string;
  role: string;
  ts: string;
  importance: number;
  score: number;
}

export async function recallSimilar(
  tx: ManagedTransaction,
  queryEmbedding: number[],
  topK: number = RETRIEVAL_LIMITS.DEFAULT_TOP_K,
  userId?: string,
): Promise<RetrievedMessage[]> {
  validateEmbedding(queryEmbedding, EMBEDDING_DIMENSION);
  validatePositiveInteger(topK, 1, 100);

  try {
    let query: string;
    let params: Record<string, unknown>;

    if (userId) {
      query = `
        CALL db.index.vector.queryNodes('msg_emb_idx', $top_k, $query_embedding)
        YIELD node, score
        MATCH (u:User {id: $user_id})-[:HAS_SESSION]->(:Session)-[:HAS_MESSAGE]->(node)
        RETURN node.id AS id,
               node.text AS text, 
               node.role AS role, 
               node.ts AS ts,
               node.importance AS importance,
               score
        ORDER BY score DESC
      `;
      params = {
        query_embedding: queryEmbedding,
        top_k: topK,
        user_id: userId,
      };
    } else {
      query = `
        CALL db.index.vector.queryNodes('msg_emb_idx', $top_k, $query_embedding)
        YIELD node, score
        RETURN node.id AS id,
               node.text AS text, 
               node.role AS role, 
               node.ts AS ts,
               node.importance AS importance,
               score
        ORDER BY score DESC
      `;
      params = {
        query_embedding: queryEmbedding,
        top_k: topK,
      };
    }

    const result = tx.run(query, params);

    if (!result) {
      return [];
    }

    const records = await getRecordsAsync<Neo4jRecord>(result);
    return records.map((record: Neo4jRecord) => ({
      id: record.get("id") as string,
      text: record.get("text") as string,
      role: record.get("role") as string,
      ts: record.get("ts")?.toString() || "",
      importance: record.get("importance")
        ? (record.get("importance") as number)
        : DEFAULT_IMPORTANCE.MESSAGE,
      score: record.get("score") as number,
    }));
  } catch (error) {
    logger.error("Error in recallSimilar:", error);
    return [];
  }
}

export async function retrieveSimilarMemories(
  session: Session,
  queryEmbedding: number[],
  topK: number = RETRIEVAL_LIMITS.DEFAULT_TOP_K,
  userId?: string,
): Promise<RetrievedMessage[]> {
  validateEmbedding(queryEmbedding, EMBEDDING_DIMENSION);
  validatePositiveInteger(topK, 1, 100);
  return session.executeRead(
    async (tx) => await recallSimilar(tx, queryEmbedding, topK, userId),
  );
}
