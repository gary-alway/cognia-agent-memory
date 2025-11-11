import { randomUUID } from "crypto";
import type { ManagedTransaction, Session } from "neo4j-driver";
import { getEmbeddingsClient } from "../clients/embeddings.js";
import { EMBEDDING_DIMENSION } from "../core/config.js";
import {
  DEFAULT_IMPORTANCE,
  TEXT_LENGTH_THRESHOLDS,
} from "../core/constants.js";
import {
  validateEmbedding,
  validateNonEmptyString,
  validateNumberInRange,
} from "../core/validation.js";
import { createEntityId, extractAndStoreEntities } from "../memory/entities.js";
import { extractAndStoreFacts } from "../memory/facts.js";
import { storeToolCall } from "../memory/tools.js";

export interface EnrichedIngestOptions {
  extractEntities?: boolean;
  extractFacts?: boolean;
  importance?: number;
}

async function storeEnrichedMessage(
  tx: ManagedTransaction,
  sessionId: string,
  role: string,
  text: string,
  embedding: number[],
  importance: number = DEFAULT_IMPORTANCE.MESSAGE,
  extractEntities: boolean = true,
  extractFacts: boolean = true,
): Promise<string> {
  validateNonEmptyString(sessionId);
  validateNonEmptyString(role);
  validateNonEmptyString(text);
  validateEmbedding(embedding, EMBEDDING_DIMENSION);
  validateNumberInRange(importance, 0, 1);

  const messageId = randomUUID();

  tx.run(
    `
    MERGE (s:Session {id: $session_id})
    ON CREATE SET s.startedAt = datetime()
    WITH s
    CREATE (m:Message {
        id: $message_id,
        role: $role,
        text: $text,
        embedding: $embedding,
        importance: $importance,
        ts: datetime()
    })
    MERGE (s)-[:HAS_MESSAGE]->(m)
    `,
    {
      session_id: sessionId,
      message_id: messageId,
      role: role,
      text: text,
      embedding: embedding,
      importance: importance,
    },
  );

  let entities: Array<{ type: string; name: string }> = [];
  if (
    extractEntities &&
    text.length > TEXT_LENGTH_THRESHOLDS.ENTITY_EXTRACTION
  ) {
    entities = await extractAndStoreEntities(tx, messageId, text);
  }

  if (
    extractFacts &&
    text.length > TEXT_LENGTH_THRESHOLDS.FACT_EXTRACTION &&
    entities.length > 0
  ) {
    const entityIds = entities.map((e) =>
      createEntityId(e.type || "OTHER", e.name || ""),
    );
    await extractAndStoreFacts(tx, messageId, text, entityIds);
  }

  return messageId;
}

export async function ingestEnrichedMessage(
  session: Session,
  sessionId: string,
  role: string,
  text: string,
  options: EnrichedIngestOptions = {},
): Promise<string> {
  validateNonEmptyString(sessionId);
  validateNonEmptyString(role);
  validateNonEmptyString(text);

  const {
    extractEntities = true,
    extractFacts = true,
    importance = DEFAULT_IMPORTANCE.MESSAGE,
  } = options;

  validateNumberInRange(importance, 0, 1);

  const embeddingsClient = getEmbeddingsClient();
  const embedding = await embeddingsClient.generateEmbedding(text);

  return session.executeWrite((tx) =>
    storeEnrichedMessage(
      tx,
      sessionId,
      role,
      text,
      embedding,
      importance,
      extractEntities,
      extractFacts,
    ),
  );
}

export async function ingestWithToolTracking(
  session: Session,
  sessionId: string,
  role: string,
  text: string,
  toolName?: string,
  toolArgs?: Record<string, unknown>,
  toolStatus?: string,
  toolLatency?: number,
): Promise<[string, string | null]> {
  const messageId = await ingestEnrichedMessage(
    session,
    sessionId,
    role,
    text,
    {
      importance: DEFAULT_IMPORTANCE.TOOL_TRACKING,
      extractEntities: true,
      extractFacts: false,
    },
  );

  let toolCallId: string | null = null;
  if (toolName) {
    toolCallId = await session.executeWrite((tx) => {
      return storeToolCall(
        tx,
        messageId,
        toolName,
        toolArgs || {},
        toolStatus || "success",
        toolLatency,
      );
    });
  }

  return [messageId, toolCallId];
}
