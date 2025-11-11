import type { ManagedTransaction, Record as Neo4jRecord } from "neo4j-driver";
import { EMBEDDING_DIMENSION } from "../core/config.js";
import {
  DEFAULT_IMPORTANCE,
  FACT_SCORING_WEIGHTS,
  RERANK_WEIGHTS,
  RETRIEVAL_LIMITS,
} from "../core/constants.js";
import { getLogger } from "../core/logger.js";
import { getRecords } from "../core/neo4j-helpers.js";
import {
  validateEmbedding,
  validateNonEmptyString,
  validatePositiveInteger,
} from "../core/validation.js";
import type { FactWithScore } from "../memory/facts.js";
import { searchFacts } from "../memory/facts.js";
import { getUserPreferences } from "../memory/preferences.js";
import { recallFromArchived } from "./archived_retrieval.js";
import type { RetrievedMessage } from "./retrieval.js";
import { recallSimilar } from "./retrieval.js";

const logger = getLogger("advanced-retrieval");

export interface RetrievedResult {
  messages: Array<{
    id: string;
    text: string;
    role: string;
    ts: string;
    importance: number;
    score: number;
    final_score?: number;
  }>;
  facts?: Array<{
    id: string;
    text: string;
    confidence: number;
    score: number;
    final_score?: number;
  }>;
  entities?: Array<{
    type: string;
    name: string;
  }>;
  tools?: Array<{
    id: string;
    name: string;
    status: string;
  }>;
  expanded?: {
    entities: Array<{ type: string; name: string }>;
    facts: Array<{ id: string; text: string; confidence: number }>;
    tools: Array<{ id: string; name: string; status: string }>;
  };
}

export function calculateRecencyScore(timestampStr: string): number {
  try {
    const timestamp = new Date(timestampStr);
    if (isNaN(timestamp.getTime())) {
      return 0.0;
    }
    const now = new Date();
    const hoursAgo = (now.getTime() - timestamp.getTime()) / (1000 * 60 * 60);
    return 1.0 / (1.0 + hoursAgo);
  } catch {
    return 0.0;
  }
}

export function patternExpansionRetrieval(
  tx: ManagedTransaction,
  seedMessageIds: string[],
  includeEntities: boolean = true,
  includeFacts: boolean = true,
  includeTools: boolean = true,
  userId?: string,
): RetrievedResult {
  let query: string;
  if (userId) {
    query = `MATCH (u:User {id: $user_id})-[:HAS_SESSION]->(:Session)-[:HAS_MESSAGE]->(m:Message) WHERE m.id IN $seed_ids`;
  } else {
    query = `MATCH (m:Message) WHERE m.id IN $seed_ids`;
  }
  const optionalMatches: string[] = [];
  const returns: string[] = ["collect(distinct m) AS messages"];

  if (includeEntities) {
    optionalMatches.push("OPTIONAL MATCH (m)-[:MENTIONS]->(e:Entity)");
    returns.push("collect(distinct e) AS entities");
  }

  if (includeFacts) {
    optionalMatches.push("OPTIONAL MATCH (m)-[:EXTRACTED_FACT]->(f:Fact)");
    optionalMatches.push("OPTIONAL MATCH (e)<-[:ABOUT]-(f2:Fact)");
    returns.push(
      `collect(distinct f) + collect(distinct f2)[0..${RETRIEVAL_LIMITS.PATTERN_EXPANSION_FACTS}] AS facts`,
    );
  }

  if (includeTools) {
    optionalMatches.push(
      "OPTIONAL MATCH (m)-[:USED_TOOL]->(t:ToolCall {status:'success'})",
    );
    returns.push(
      `collect(distinct t)[0..${RETRIEVAL_LIMITS.PATTERN_EXPANSION_TOOLS}] AS tools`,
    );
  }

  const fullQuery =
    query +
    "\n" +
    optionalMatches.join("\n") +
    "\nWITH m, e, f, f2, t\nRETURN " +
    returns.join(", ");

  const params: Record<string, unknown> = { seed_ids: seedMessageIds };
  if (userId) {
    params.user_id = userId;
  }

  const result = tx.run(fullQuery, params);

  const records = getRecords<Neo4jRecord>(result);
  if (!records || records.length === 0) {
    return { messages: [] };
  }
  const record = records[0];
  if (!record) {
    return { messages: [] };
  }

  const messages =
    (record.get("messages") as Array<{
      id: string;
      text: string;
      role: string;
      ts: string;
      importance: number;
    }>) || [];

  const resultData: RetrievedResult = {
    messages: messages.map((m) => ({
      id: m.id,
      text: m.text,
      role: m.role,
      ts: m.ts?.toString() || "",
      importance: m.importance || DEFAULT_IMPORTANCE.MESSAGE,
      score: 1.0,
    })),
  };

  if (includeEntities || includeFacts || includeTools) {
    resultData.expanded = {
      entities: [],
      facts: [],
      tools: [],
    };
  }

  if (includeEntities) {
    const entities =
      (record.get("entities") as Array<{
        type: string;
        name: string;
      }>) || [];
    resultData.expanded!.entities = entities;
  }

  if (includeFacts) {
    const facts =
      (record.get("facts") as Array<{
        id: string;
        text: string;
        confidence: number;
      }>) || [];
    resultData.expanded!.facts = facts.slice(
      0,
      RETRIEVAL_LIMITS.PATTERN_EXPANSION_FACTS,
    );
  }

  if (includeTools) {
    const tools =
      (record.get("tools") as Array<{
        id: string;
        name: string;
        status: string;
      }>) || [];
    resultData.expanded!.tools = tools.slice(
      0,
      RETRIEVAL_LIMITS.PATTERN_EXPANSION_TOOLS,
    );
  }

  return resultData;
}

export async function hybridRetrieval(
  tx: ManagedTransaction,
  queryEmbedding: number[],
  topK: number = RETRIEVAL_LIMITS.DEFAULT_HYBRID_TOP_K,
  includeFacts: boolean = true,
  userId?: string,
): Promise<RetrievedResult> {
  let messages: RetrievedMessage[] = [];
  try {
    messages = await recallSimilar(tx, queryEmbedding, topK, userId);
  } catch (error) {
    logger.error("Error in recallSimilar:", error);
  }

  if (includeFacts) {
    let facts: FactWithScore[] = [];
    try {
      facts = await searchFacts(
        tx,
        queryEmbedding,
        Math.max(1, Math.floor(topK * RETRIEVAL_LIMITS.HYBRID_FACTS_RATIO)),
        userId,
      );
    } catch (error) {
      logger.error("Error in searchFacts:", error);
    }
    return {
      messages: messages,
      facts,
    };
  }

  return {
    messages: messages,
  };
}

export function rerankResults(
  results: RetrievedResult,
  userPreferences?: Array<{ key: string; value: string }>,
  vectorWeight: number = RERANK_WEIGHTS.VECTOR,
  recencyWeight: number = RERANK_WEIGHTS.RECENCY,
  importanceWeight: number = RERANK_WEIGHTS.IMPORTANCE,
): RetrievedResult {
  const messages = (results?.messages || []).map((msg) => {
    const recencyScore = calculateRecencyScore(msg.ts);
    let preferenceBoost = 0.0;

    if (userPreferences) {
      for (const pref of userPreferences) {
        if (msg.text.toLowerCase().includes(pref.value.toLowerCase())) {
          preferenceBoost += RERANK_WEIGHTS.PREFERENCE_BOOST;
        }
      }
    }

    const finalScore =
      msg.score * vectorWeight +
      recencyScore * recencyWeight +
      msg.importance * importanceWeight +
      preferenceBoost;

    return {
      ...msg,
      final_score: finalScore,
      score: msg.score,
    };
  });

  messages.sort((a, b) => (b.final_score || 0) - (a.final_score || 0));

  const facts = results.facts
    ? results.facts.map((fact) => ({
        ...fact,
        final_score:
          fact.score * FACT_SCORING_WEIGHTS.SCORE +
          fact.confidence * FACT_SCORING_WEIGHTS.CONFIDENCE,
      }))
    : undefined;

  if (facts) {
    facts.sort((a, b) => (b.final_score || 0) - (a.final_score || 0));
  }

  return {
    ...results,
    messages,
    facts,
  };
}

export async function retrieveWithExpansionAndRerank(
  tx: ManagedTransaction,
  queryEmbedding: number[],
  userId?: string,
  topK: number = RETRIEVAL_LIMITS.DEFAULT_HYBRID_TOP_K,
  expand: boolean = true,
  includeArchived: boolean = false,
): Promise<RetrievedResult> {
  validateEmbedding(queryEmbedding, EMBEDDING_DIMENSION);
  validatePositiveInteger(topK, 1, 100);
  if (userId) {
    validateNonEmptyString(userId);
  }

  try {
    let userPreferences: Array<{ key: string; value: string }> | undefined;

    if (userId) {
      try {
        const prefs = await getUserPreferences(tx, userId);
        userPreferences = (prefs || []).map((p) => ({
          key: p.key,
          value: p.value,
        }));
      } catch (error) {
        logger.error("Error getting user preferences:", error);
      }
    }

    const hybridResults = await hybridRetrieval(
      tx,
      queryEmbedding,
      topK,
      true,
      userId,
    );
    if (!hybridResults || !hybridResults.messages) {
      return { messages: [] };
    }

    const allMessages = [...(hybridResults.messages || [])];

    if (includeArchived) {
      try {
        const archivedTopK = Math.max(
          1,
          Math.floor(topK * RETRIEVAL_LIMITS.ARCHIVED_MEMORY_RATIO),
        );
        const archivedMessages = await recallFromArchived(
          queryEmbedding,
          archivedTopK,
          RETRIEVAL_LIMITS.ARCHIVED_MEMORY_MAX_SESSIONS,
        );
        allMessages.push(...archivedMessages);
      } catch (error) {
        logger.warn("Error retrieving from archived memory:", error);
      }
    }

    const combinedResults: RetrievedResult = {
      ...hybridResults,
      messages: allMessages,
    };

    let expandedResults = combinedResults;

    if (expand && hybridResults.messages && hybridResults.messages.length > 0) {
      try {
        const seedIds = hybridResults.messages
          .slice(0, RETRIEVAL_LIMITS.PATTERN_EXPANSION_SEED_MESSAGES)
          .map((m) => m.id);
        const expanded = patternExpansionRetrieval(
          tx,
          seedIds,
          true,
          true,
          true,
          userId,
        );

        expandedResults = {
          ...hybridResults,
          expanded: expanded.expanded,
        };
      } catch (error) {
        logger.error("Error in pattern expansion:", error);
      }
    }

    return rerankResults(expandedResults, userPreferences);
  } catch (error) {
    logger.error("Error in retrieveWithExpansionAndRerank:", error);
    return { messages: [] };
  }
}
