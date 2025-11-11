import { getEmbeddingsClient } from "../clients/embeddings.js";
import { EMBEDDING_DIMENSION } from "../core/config.js";
import {
  DEFAULT_IMPORTANCE,
  RETRIEVAL_LIMITS,
  RERANK_WEIGHTS,
} from "../core/constants.js";
import { getLogger } from "../core/logger.js";
import {
  validateEmbedding,
  validatePositiveInteger,
} from "../core/validation.js";
import type { SessionData } from "../archival/archival.js";
import { getArchivalService } from "../archival/archival.js";
import type { RetrievedMessage } from "./retrieval.js";
import { calculateRecencyScore } from "./advanced_retrieval.js";

const logger = getLogger("archived-retrieval");

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    return 0;
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function searchArchivedSession(
  sessionData: SessionData,
  queryEmbedding: number[],
  embeddingsClient: ReturnType<typeof getEmbeddingsClient>,
): Promise<RetrievedMessage[]> {
  const results: RetrievedMessage[] = [];

  for (const message of sessionData.messages || []) {
    if (!message.text || message.text.trim().length === 0) {
      continue;
    }

    try {
      const messageEmbedding = await embeddingsClient.generateEmbedding(
        message.text,
      );
      const score = cosineSimilarity(queryEmbedding, messageEmbedding);
      const recencyScore = calculateRecencyScore(message.ts || "");
      const importance = DEFAULT_IMPORTANCE.MESSAGE;

      const finalScore =
        score * RERANK_WEIGHTS.VECTOR +
        recencyScore * RERANK_WEIGHTS.RECENCY +
        importance * RERANK_WEIGHTS.IMPORTANCE;

      results.push({
        id: message.id,
        text: message.text,
        role: message.role || "unknown",
        ts: message.ts || "",
        importance,
        score: finalScore,
      });
    } catch (error) {
      logger.warn(
        `Failed to generate embedding for archived message ${message.id}:`,
        error instanceof Error ? error.message : String(error),
      );
      continue;
    }
  }

  return results;
}

export async function recallFromArchived(
  queryEmbedding: number[],
  topK: number = RETRIEVAL_LIMITS.DEFAULT_TOP_K,
  maxSessions: number = 10,
): Promise<RetrievedMessage[]> {
  validateEmbedding(queryEmbedding, EMBEDDING_DIMENSION);
  validatePositiveInteger(topK, 1, 100);
  validatePositiveInteger(maxSessions, 1, 100);

  try {
    const archivalService = getArchivalService();
    const embeddingsClient = getEmbeddingsClient();

    const sessionObjects =
      await archivalService.listArchivedSessions("sessions/");

    if (sessionObjects.length === 0) {
      return [];
    }

    const sessionsToSearch = sessionObjects.slice(0, maxSessions);
    const allResults: RetrievedMessage[] = [];

    for (const objectName of sessionsToSearch) {
      try {
        const sessionData = await archivalService.retrieveSession(objectName);
        const sessionResults = await searchArchivedSession(
          sessionData,
          queryEmbedding,
          embeddingsClient,
        );
        allResults.push(...sessionResults);
      } catch (error) {
        logger.warn(
          `Failed to search archived session ${objectName}:`,
          error instanceof Error ? error.message : String(error),
        );
        continue;
      }
    }

    allResults.sort((a, b) => b.score - a.score);
    return allResults.slice(0, topK);
  } catch (error) {
    logger.error("Error in recallFromArchived:", error);
    return [];
  }
}
