import { randomUUID } from "crypto";
import type { Session, ManagedTransaction } from "neo4j-driver";
import { getEmbeddingsClient } from "../clients/embeddings.js";

function createMessage(
  tx: ManagedTransaction,
  messageId: string,
  sessionId: string,
  role: string,
  text: string,
  embedding: number[],
  importance: number = 0.5,
): void {
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
}

export async function ingestMessage(
  session: Session,
  sessionId: string,
  role: string,
  text: string,
  importance: number = 0.5,
): Promise<string> {
  const embeddingsClient = getEmbeddingsClient();
  const messageId = randomUUID();

  const embedding = await embeddingsClient.generateEmbedding(text);

  await session.executeWrite((tx) => {
    createMessage(tx, messageId, sessionId, role, text, embedding, importance);
  });

  return messageId;
}
