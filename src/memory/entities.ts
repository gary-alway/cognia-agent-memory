import type { ManagedTransaction, Record } from "neo4j-driver";
import { RETRIEVAL_LIMITS } from "../core/constants.js";
import { getLLMClient } from "../clients/llm.js";
import { getRecords } from "../core/neo4j-helpers.js";

export interface Entity {
  type: string;
  name: string;
}

export interface EntityRecord {
  type: string;
  name: string;
  id: string;
}

export interface RelatedEntity extends EntityRecord {
  strength: number;
}

export function createEntityId(entityType: string, name: string): string {
  return `${entityType.toLowerCase()}:${name.toLowerCase().trim()}`;
}

export async function extractAndStoreEntities(
  tx: ManagedTransaction,
  messageId: string,
  text: string,
): Promise<Entity[]> {
  const llmClient = getLLMClient();
  const entities = await llmClient.extractEntities(text);

  for (const entity of entities) {
    const entityType = entity.type || "OTHER";
    const name = entity.name || "";
    if (!name) {
      continue;
    }

    const canonicalId = createEntityId(entityType, name);

    tx.run(
      `
      MERGE (e:Entity {canonicalId: $canonical_id})
      ON CREATE SET e.type = $type, e.name = $name, e.createdAt = datetime()
      ON MATCH SET e.lastSeen = datetime()
      WITH e
      MATCH (m:Message {id: $message_id})
      MERGE (m)-[:MENTIONS]->(e)
      `,
      {
        canonical_id: canonicalId,
        type: entityType,
        name: name,
        message_id: messageId,
      },
    );
  }

  return entities;
}

export function getEntity(
  tx: ManagedTransaction,
  canonicalId: string,
): EntityRecord | null {
  const result = tx.run(
    `
    MATCH (e:Entity {canonicalId: $canonical_id})
    RETURN e.type AS type, e.name AS name, e.canonicalId AS id
    `,
    { canonical_id: canonicalId },
  );

  const records = getRecords<Record>(result);
  const record = records[0];
  if (record) {
    return {
      type: record.get("type") as string,
      name: record.get("name") as string,
      id: record.get("id") as string,
    };
  }
  return null;
}

export function getEntitiesForMessage(
  tx: ManagedTransaction,
  messageId: string,
): EntityRecord[] {
  const result = tx.run(
    `
    MATCH (m:Message {id: $message_id})-[:MENTIONS]->(e:Entity)
    RETURN e.type AS type, e.name AS name, e.canonicalId AS id
    `,
    { message_id: messageId },
  );

  const records = getRecords<Record>(result);
  return records.map((record: Record) => ({
    type: record.get("type") as string,
    name: record.get("name") as string,
    id: record.get("id") as string,
  }));
}

export function getRelatedEntities(
  tx: ManagedTransaction,
  canonicalId: string,
): RelatedEntity[] {
  const result = tx.run(
    `
    MATCH (e1:Entity {canonicalId: $canonical_id})
    MATCH (e1)<-[:MENTIONS]-(m:Message)-[:MENTIONS]->(e2:Entity)
    WHERE e1 <> e2
    WITH e2, count(m) as strength
    RETURN e2.type AS type, e2.name AS name, e2.canonicalId AS id, strength
    ORDER BY strength DESC
    LIMIT ${RETRIEVAL_LIMITS.RELATED_ENTITIES}
    `,
    { canonical_id: canonicalId },
  );

  const records = getRecords<Record>(result);
  return records.map((record: Record) => ({
    type: record.get("type") as string,
    name: record.get("name") as string,
    id: record.get("id") as string,
    strength: (record.get("strength") as { toNumber(): number }).toNumber(),
  }));
}
