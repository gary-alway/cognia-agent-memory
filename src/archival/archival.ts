import { randomUUID } from "crypto";
import { Client } from "minio";
import type {
  ManagedTransaction,
  Record as Neo4jRecord,
  Session,
} from "neo4j-driver";
import { getEmbeddingsClient } from "../clients/embeddings.js";
import {
  ARCHIVE_AGE_DAYS,
  EMBEDDING_DIMENSION,
  MINIO_ACCESS_KEY,
  MINIO_BUCKET,
  MINIO_ENDPOINT,
  MINIO_SECRET_KEY,
  MINIO_SECURE,
} from "../core/config.js";
import { DEFAULT_IMPORTANCE } from "../core/constants.js";
import { getLogger } from "../core/logger.js";
import { getRecordsAsync } from "../core/neo4j-helpers.js";
import { createEntityId, extractAndStoreEntities } from "../memory/entities.js";
import { extractAndStoreFacts } from "../memory/facts.js";

const logger = getLogger("archival");

export interface SessionData {
  id: string;
  messages: Array<{
    id: string;
    role: string;
    text: string;
    ts: string;
    embedding?: number[];
  }>;
  entities: Array<{
    type: string;
    name: string;
  }>;
  tools: Array<{
    name: string;
    status: string;
    latency?: number;
  }>;
}

export interface ToolTrace {
  tool: string;
  timestamp: string;
  status: string;
  latency_ms?: number;
}

export class ArchivalService {
  private client: Client;

  constructor() {
    const { host, port } = this.parseEndpoint(MINIO_ENDPOINT);
    this.client = new Client({
      endPoint: host,
      port: port,
      useSSL: MINIO_SECURE,
      accessKey: MINIO_ACCESS_KEY,
      secretKey: MINIO_SECRET_KEY,
    });
    this.ensureBucket();
  }

  private parseEndpoint(endpoint: string): { host: string; port: number } {
    let url: URL;

    try {
      if (endpoint.includes("://")) {
        url = new URL(endpoint);
      } else {
        url = new URL(`http://${endpoint}`);
      }
    } catch {
      throw new Error(`Invalid MinIO endpoint format: ${endpoint}`);
    }

    const host = url.hostname;
    const port = url.port ? parseInt(url.port, 10) : 9000;

    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid MinIO port: ${url.port}`);
    }

    return { host, port };
  }

  private async ensureBucket(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(MINIO_BUCKET);
      if (!exists) {
        await this.client.makeBucket(MINIO_BUCKET, "us-east-1");
        logger.info(`Created bucket: ${MINIO_BUCKET}`);
      }
    } catch (error) {
      logger.error(`Error ensuring bucket: ${error}`);
    }
  }

  async archiveSession(sessionData: SessionData): Promise<string> {
    const sessionId = sessionData.id || "unknown";
    const timestamp = new Date().toISOString();
    const objectName = `sessions/${sessionId}/${timestamp}.json`;

    const data = JSON.stringify(sessionData, null, 2);
    const buffer = Buffer.from(data, "utf-8");

    try {
      await this.client.putObject(
        MINIO_BUCKET,
        objectName,
        buffer,
        buffer.length,
        {
          "Content-Type": "application/json",
        },
      );
      return objectName;
    } catch (error) {
      throw new Error(`Failed to archive session: ${error}`);
    }
  }

  async retrieveSession(objectName: string): Promise<SessionData> {
    try {
      const stream = await this.client.getObject(MINIO_BUCKET, objectName);
      const chunks: Buffer[] = [];

      return new Promise<SessionData>((resolve, reject) => {
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("end", () => {
          const data = Buffer.concat(chunks).toString("utf-8");
          resolve(JSON.parse(data) as SessionData);
        });
        stream.on("error", (error) => {
          reject(new Error(`Failed to retrieve session: ${error}`));
        });
      });
    } catch (error) {
      throw new Error(`Failed to retrieve session: ${error}`);
    }
  }

  async listArchivedSessions(prefix: string = "sessions/"): Promise<string[]> {
    try {
      const objects: string[] = [];
      const stream = this.client.listObjects(MINIO_BUCKET, prefix, true);

      return new Promise<string[]>((resolve) => {
        stream.on("data", (obj) => {
          if (obj.name) {
            objects.push(obj.name);
          }
        });
        stream.on("end", () => resolve(objects));
        stream.on("error", (error) => {
          logger.error(`Error listing sessions: ${error}`);
          resolve([]);
        });
      });
    } catch (error) {
      logger.error(`Error listing sessions: ${error}`);
      return [];
    }
  }

  async listArchivedSessionsWithMetadata(prefix: string = "sessions/"): Promise<
    Array<{
      objectName: string;
      sessionId: string;
      timestamp: string;
      archivedAt: string;
      messageCount: number;
    }>
  > {
    try {
      const objectNames: string[] = [];
      const stream = this.client.listObjects(MINIO_BUCKET, prefix, true);

      const objectNamesPromise = new Promise<string[]>((resolve) => {
        stream.on("data", (obj) => {
          if (obj.name && obj.name.endsWith(".json")) {
            objectNames.push(obj.name);
          }
        });
        stream.on("end", () => resolve(objectNames));
        stream.on("error", (error) => {
          logger.error(`Error listing sessions: ${error}`);
          resolve([]);
        });
      });

      const names = await objectNamesPromise;
      const sessions: Array<{
        objectName: string;
        sessionId: string;
        timestamp: string;
        archivedAt: string;
        messageCount: number;
      }> = [];

      for (const objectName of names) {
        const parts = objectName.split("/");
        if (parts.length >= 3 && parts[0] === "sessions") {
          const sessionId = parts[1];
          const filename = parts[2];
          const timestamp = filename.replace(".json", "");

          try {
            const stat = await this.client.statObject(MINIO_BUCKET, objectName);
            const sessionData = await this.retrieveSession(objectName);
            sessions.push({
              objectName,
              sessionId,
              timestamp,
              archivedAt: stat.lastModified.toISOString(),
              messageCount: sessionData.messages.length,
            });
          } catch (error) {
            logger.error(`Error getting metadata for ${objectName}: ${error}`);
          }
        }
      }

      sessions.sort(
        (a, b) =>
          new Date(b.archivedAt).getTime() - new Date(a.archivedAt).getTime(),
      );
      return sessions;
    } catch (error) {
      logger.error(`Error listing sessions: ${error}`);
      return [];
    }
  }

  async archiveToolTraces(traces: ToolTrace[]): Promise<string> {
    const timestamp = new Date().toISOString();
    const objectName = `traces/${timestamp}.json`;

    const data = JSON.stringify(traces, null, 2);
    const buffer = Buffer.from(data, "utf-8");

    try {
      await this.client.putObject(
        MINIO_BUCKET,
        objectName,
        buffer,
        buffer.length,
        {
          "Content-Type": "application/json",
        },
      );
      return objectName;
    } catch (error) {
      throw new Error(`Failed to archive traces: ${error}`);
    }
  }
}

export async function getOldSessions(
  tx: ManagedTransaction,
  daysOld: number = ARCHIVE_AGE_DAYS,
): Promise<SessionData[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const result = tx.run(
    `
    MATCH (s:Session)-[:HAS_MESSAGE]->(m:Message)
    WITH s, max(m.ts) as last_activity
    WHERE last_activity < datetime($cutoff)
    OPTIONAL MATCH (s)-[:HAS_MESSAGE]->(m2:Message)
    OPTIONAL MATCH (m2)-[:MENTIONS]->(e:Entity)
    OPTIONAL MATCH (m2)-[:USED_TOOL]->(t:ToolCall)
    RETURN s.id AS session_id,
           collect(distinct {
               id: m2.id,
               role: m2.role,
               text: m2.text,
               ts: m2.ts,
               embedding: m2.embedding
           }) AS messages,
           collect(distinct {
               type: e.type,
               name: e.name
           }) AS entities,
           collect(distinct {
               name: t.name,
               status: t.status,
               latency: t.latency
           }) AS tools
    `,
    { cutoff: cutoffDate.toISOString() },
  );

  const records = await getRecordsAsync<Neo4jRecord>(result);
  if (records.length === 0) {
    return [];
  }

  return records.map((record: Neo4jRecord) => {
    const messages = record.get("messages") as Array<{
      id: string;
      role: string;
      text: string;
      ts: string;
      embedding?: number[];
    }>;
    const entities = record.get("entities") as Array<{
      type: string;
      name: string;
    }>;
    const tools = record.get("tools") as Array<{
      name: string;
      status: string;
      latency?: number;
    }>;

    return {
      id: record.get("session_id") as string,
      messages: messages.filter((m) => m.id),
      entities: entities.filter((e) => e.type && e.name),
      tools: tools.filter((t) => t.name && t.status),
    };
  });
}

export async function archiveOldSessions(
  session: Session,
  archivalService: ArchivalService,
  daysOld: number = ARCHIVE_AGE_DAYS,
): Promise<number> {
  const oldSessions = await session.executeRead(
    async (tx) => await getOldSessions(tx, daysOld),
  );

  let archivedCount = 0;
  for (const sessionData of oldSessions) {
    try {
      const objectName = await archivalService.archiveSession(sessionData);
      logger.info(`Archived session ${sessionData.id} to ${objectName}`);
      archivedCount++;
    } catch (error) {
      logger.error(`Failed to archive session ${sessionData.id}: ${error}`);
    }
  }

  return archivedCount;
}

export async function restoreSessionToNeo4j(
  session: Session,
  sessionData: SessionData,
): Promise<{ messageCount: number; entityCount: number; toolCount: number }> {
  const embeddingsClient = getEmbeddingsClient();
  let messageCount = 0;
  let entityCount = 0;
  const toolCount = 0;

  const sortedMessages = [...sessionData.messages].sort((a, b) => {
    const timeA = new Date(a.ts).getTime();
    const timeB = new Date(b.ts).getTime();
    if (isNaN(timeA) || isNaN(timeB)) {
      logger.warn(`Invalid timestamp in archived message: ${a.ts} or ${b.ts}`);
      return 0;
    }
    return timeA - timeB;
  });

  // Use stored embeddings if available, otherwise generate on-the-fly
  const messageEmbeddings = await Promise.all(
    sortedMessages.map(async (msg) => {
      if (msg.embedding && msg.embedding.length === EMBEDDING_DIMENSION) {
        return msg.embedding;
      }

      // Fallback: generate embedding for old archives without stored embeddings
      logger.debug(
        `Generating embedding for message ${msg.id} during restore (no stored embedding)`,
      );
      return embeddingsClient.generateEmbedding(msg.text).catch((error) => {
        logger.error(
          `Failed to generate embedding for message ${msg.id}: ${error}`,
        );
        return new Array(EMBEDDING_DIMENSION).fill(0);
      });
    }),
  );

  await session.executeWrite(async (tx) => {
    tx.run(
      `
      MERGE (s:Session {id: $session_id})
      ON CREATE SET s.startedAt = datetime()
      `,
      { session_id: sessionData.id },
    );

    for (let i = 0; i < sortedMessages.length; i++) {
      const msg = sortedMessages[i];
      const messageId = msg.id || randomUUID();
      const embedding = messageEmbeddings[i];

      tx.run(
        `
        MATCH (s:Session {id: $session_id})
        MERGE (m:Message {id: $message_id})
        ON CREATE SET m.role = $role,
                     m.text = $text,
                     m.embedding = $embedding,
                     m.importance = $importance,
                     m.ts = datetime($timestamp)
        MERGE (s)-[:HAS_MESSAGE]->(m)
        `,
        {
          session_id: sessionData.id,
          message_id: messageId,
          role: msg.role,
          text: msg.text,
          embedding: embedding,
          importance: DEFAULT_IMPORTANCE.MESSAGE,
          timestamp: msg.ts,
        },
      );

      const entities = await extractAndStoreEntities(tx, messageId, msg.text);
      entityCount += entities.length;

      if (entities.length > 0 && msg.role === "assistant") {
        const entityIds = entities.map((e) =>
          createEntityId(e.type || "OTHER", e.name || ""),
        );
        await extractAndStoreFacts(tx, messageId, msg.text, entityIds);
      }

      messageCount++;
    }
  });

  if (sessionData.tools.length > 0) {
    logger.warn(
      `Session ${sessionData.id} has ${sessionData.tools.length} tools, but tool-to-message relationships are not preserved in archived data. Tools will not be restored.`,
    );
  }

  return { messageCount, entityCount, toolCount };
}

let _archivalService: ArchivalService | null = null;

export function getArchivalService(): ArchivalService {
  if (_archivalService === null) {
    _archivalService = new ArchivalService();
  }
  return _archivalService;
}
