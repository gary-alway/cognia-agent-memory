import type { ManagedTransaction, Record as Neo4jRecord } from "neo4j-driver";
import { DEFAULT_CONFIDENCE } from "../core/constants.js";
import { getRecords, getRecordsAsync } from "../core/neo4j-helpers.js";

export interface Preference {
  key: string;
  value: string;
  confidence: number;
}

export function createOrUpdatePreference(
  tx: ManagedTransaction,
  userId: string,
  key: string,
  value: string,
  confidence: number = DEFAULT_CONFIDENCE.PREFERENCE,
): void {
  tx.run(
    `
    MERGE (u:User {id: $user_id})
    ON CREATE SET u.createdAt = datetime()
    WITH u
    MERGE (p:Preference {key: $key})
    ON CREATE SET p.createdAt = datetime()
    MERGE (u)-[r:HAS_PREFERENCE]->(p)
    SET p.value = $value,
        p.confidence = $confidence,
        p.updatedAt = datetime()
    `,
    {
      user_id: userId,
      key: key,
      value: value,
      confidence: confidence,
    },
  );
}

export async function getUserPreferences(
  tx: ManagedTransaction,
  userId: string,
): Promise<Preference[]> {
  const result = tx.run(
    `
    MATCH (u:User {id: $user_id})-[:HAS_PREFERENCE]->(p:Preference)
    RETURN p.key AS key, p.value AS value, p.confidence AS confidence
    `,
    { user_id: userId },
  );

  const records = await getRecordsAsync<Neo4jRecord>(result);
  return records.map((record: Neo4jRecord) => {
    const confidenceValue = record.get("confidence");
    const confidence =
      typeof confidenceValue === "number"
        ? confidenceValue
        : ((confidenceValue as { toNumber(): number })?.toNumber() ??
          DEFAULT_CONFIDENCE.PREFERENCE);
    return {
      key: record.get("key") as string,
      value: record.get("value") as string,
      confidence,
    };
  });
}

export function getPreference(
  tx: ManagedTransaction,
  userId: string,
  key: string,
): Preference | null {
  const result = tx.run(
    `
    MATCH (u:User {id: $user_id})-[:HAS_PREFERENCE]->(p:Preference {key: $key})
    RETURN p.value AS value, p.confidence AS confidence
    `,
    {
      user_id: userId,
      key: key,
    },
  );

  const records = getRecords<Neo4jRecord>(result);
  if (records.length === 0) {
    return null;
  }
  const record = records[0];
  const confidenceValue = record.get("confidence");
  const confidence =
    typeof confidenceValue === "number"
      ? confidenceValue
      : ((confidenceValue as { toNumber(): number })?.toNumber() ?? 1.0);
  return {
    key: key,
    value: record.get("value") as string,
    confidence,
  };
}

export function deletePreference(
  tx: ManagedTransaction,
  userId: string,
  key: string,
): void {
  tx.run(
    `
    MATCH (u:User {id: $user_id})-[r:HAS_PREFERENCE]->(p:Preference {key: $key})
    DELETE r, p
    `,
    {
      user_id: userId,
      key: key,
    },
  );
}

export function associateSessionWithUser(
  tx: ManagedTransaction,
  sessionId: string,
  userId: string,
): void {
  tx.run(
    `
    MERGE (u:User {id: $user_id})
    ON CREATE SET u.createdAt = datetime()
    WITH u
    MERGE (s:Session {id: $session_id})
    ON CREATE SET s.startedAt = datetime()
    MERGE (u)-[:HAS_SESSION]->(s)
    `,
    {
      user_id: userId,
      session_id: sessionId,
    },
  );
}
