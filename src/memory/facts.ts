import { randomUUID } from "crypto";
import type { ManagedTransaction, Record as Neo4jRecord } from "neo4j-driver";
import { getEmbeddingsClient } from "../clients/embeddings.js";
import { getLLMClient } from "../clients/llm.js";
import { EMBEDDING_DIMENSION } from "../core/config.js";
import {
  FACT_CONFIDENCE,
  RETRIEVAL_LIMITS,
  TEXT_LENGTH_THRESHOLDS,
} from "../core/constants.js";
import { getLogger } from "../core/logger.js";
import { getRecordsAsync } from "../core/neo4j-helpers.js";
import {
  validateEmbedding,
  validateNonEmptyString,
  validatePositiveInteger,
} from "../core/validation.js";

const logger = getLogger("facts");

export interface Fact {
  id: string;
  text: string;
  confidence: number;
  source: string;
  createdAt?: string;
}

export interface FactWithScore extends Fact {
  score: number;
}

function calculateFactConfidence(
  factText: string,
  entityIds: string[],
): number {
  let confidence = FACT_CONFIDENCE.BASE;

  const trimmedFact = factText.trim();
  const factLength = trimmedFact.length;

  if (factLength < TEXT_LENGTH_THRESHOLDS.SHORT_FACT) {
    confidence -= FACT_CONFIDENCE.SHORT_PENALTY;
  } else if (factLength > TEXT_LENGTH_THRESHOLDS.LONG_FACT) {
    confidence += FACT_CONFIDENCE.LONG_BOOST;
  }

  if (
    factLength > TEXT_LENGTH_THRESHOLDS.OPTIMAL_FACT_MIN &&
    factLength < TEXT_LENGTH_THRESHOLDS.OPTIMAL_FACT_MAX
  ) {
    confidence += FACT_CONFIDENCE.OPTIMAL_LENGTH_BOOST;
  }

  if (entityIds.length > 0) {
    confidence += Math.min(
      FACT_CONFIDENCE.ENTITY_MAX_BOOST,
      entityIds.length * FACT_CONFIDENCE.ENTITY_PER_BOOST,
    );
  }

  const hasCompleteSentence = /[.!?]\s*$/.test(trimmedFact);
  if (hasCompleteSentence) {
    confidence += FACT_CONFIDENCE.COMPLETE_SENTENCE_BOOST;
  }

  const hasNumbers = /\d/.test(trimmedFact);
  if (hasNumbers) {
    confidence += FACT_CONFIDENCE.HAS_NUMBERS_BOOST;
  }

  return Math.min(
    FACT_CONFIDENCE.MAX,
    Math.max(FACT_CONFIDENCE.MIN, confidence),
  );
}

export async function extractAndStoreFacts(
  tx: ManagedTransaction,
  messageId: string,
  text: string,
  entityIds: string[],
): Promise<Fact[]> {
  const llmClient = getLLMClient();
  const embeddingsClient = getEmbeddingsClient();

  const facts = await llmClient.extractFacts(text, entityIds);

  const storedFacts: Fact[] = [];

  for (const factText of facts) {
    if (!factText || factText.trim().length === 0) {
      continue;
    }

    try {
      const factId = randomUUID();
      const embedding = await embeddingsClient.generateEmbedding(factText);
      const confidence = calculateFactConfidence(factText, entityIds);

      tx.run(
        `
      CREATE (f:Fact {
          id: $fact_id,
          text: $text,
          confidence: $confidence,
          source: $source,
          embedding: $embedding,
          createdAt: datetime()
      })
      WITH f
      MATCH (m:Message {id: $message_id})
      MERGE (m)-[:EXTRACTED_FACT]->(f)
      `,
        {
          fact_id: factId,
          text: factText,
          confidence: confidence,
          source: "extracted",
          embedding: embedding,
          message_id: messageId,
        },
      );

      for (const entityId of entityIds) {
        tx.run(
          `
        MATCH (f:Fact {id: $fact_id})
        MATCH (e:Entity {canonicalId: $entity_id})
        MERGE (f)-[:ABOUT]->(e)
        `,
          {
            fact_id: factId,
            entity_id: entityId,
          },
        );
      }

      storedFacts.push({
        id: factId,
        text: factText,
        confidence: confidence,
        source: "extracted",
      });
    } catch (error) {
      logger.warn(
        `Failed to generate embedding for fact: ${factText}`,
        error instanceof Error ? error.message : String(error),
      );
      continue;
    }
  }

  return storedFacts;
}

export async function getFactsAboutEntity(
  tx: ManagedTransaction,
  entityCanonicalId: string,
  limit: number = RETRIEVAL_LIMITS.DEFAULT_FACTS_ABOUT_ENTITY,
): Promise<Fact[]> {
  validateNonEmptyString(entityCanonicalId);
  validatePositiveInteger(limit, 1, 100);
  const result = tx.run(
    `
    MATCH (e:Entity {canonicalId: $entity_id})<-[:ABOUT]-(f:Fact)
    RETURN f.id AS id, f.text AS text, f.confidence AS confidence, f.source AS source
    ORDER BY f.createdAt DESC
    LIMIT $limit
    `,
    {
      entity_id: entityCanonicalId,
      limit: limit,
    },
  );

  const records = await getRecordsAsync<Neo4jRecord>(result);
  return records.map((record: Neo4jRecord) => ({
    id: record.get("id") as string,
    text: record.get("text") as string,
    confidence: record.get("confidence") as number,
    source: record.get("source") as string,
  }));
}

export async function searchFacts(
  tx: ManagedTransaction,
  queryEmbedding: number[],
  topK: number = RETRIEVAL_LIMITS.DEFAULT_FACTS_TOP_K,
  userId?: string,
): Promise<FactWithScore[]> {
  validateEmbedding(queryEmbedding, EMBEDDING_DIMENSION);
  validatePositiveInteger(topK, 1, 100);

  let query: string;
  let params: Record<string, unknown>;

  if (userId) {
    query = `
      CALL db.index.vector.queryNodes('fact_emb_idx', $top_k, $query_embedding)
      YIELD node, score
      MATCH (u:User {id: $user_id})-[:HAS_SESSION]->(:Session)-[:HAS_MESSAGE]->(:Message)-[:EXTRACTED_FACT]->(node)
      RETURN node.id AS id,
             node.text AS text,
             node.confidence AS confidence,
             node.source AS source,
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
      CALL db.index.vector.queryNodes('fact_emb_idx', $top_k, $query_embedding)
      YIELD node, score
      RETURN node.id AS id,
             node.text AS text,
             node.confidence AS confidence,
             node.source AS source,
             score
      ORDER BY score DESC
    `;
    params = {
      query_embedding: queryEmbedding,
      top_k: topK,
    };
  }

  const result = tx.run(query, params);

  const records = await getRecordsAsync<Neo4jRecord>(result);
  return records.map((record: Neo4jRecord) => ({
    id: record.get("id") as string,
    text: record.get("text") as string,
    confidence: record.get("confidence") as number,
    source: record.get("source") as string,
    score: record.get("score") as number,
  }));
}
