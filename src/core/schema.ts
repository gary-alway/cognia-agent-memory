import neo4j, { type ManagedTransaction, type Session } from "neo4j-driver";
import { EMBEDDING_DIMENSION } from "./config.js";

export function createVectorIndexes(tx: ManagedTransaction): void {
  tx.run(
    `
    CREATE VECTOR INDEX msg_emb_idx IF NOT EXISTS
    FOR (m:Message) ON (m.embedding)
    OPTIONS { 
        indexConfig: {
            \`vector.dimensions\`: $dimensions,
            \`vector.similarity_function\`: 'cosine'
        }
    }
    `,
    { dimensions: neo4j.int(EMBEDDING_DIMENSION) },
  );

  tx.run(
    `
    CREATE VECTOR INDEX fact_emb_idx IF NOT EXISTS
    FOR (f:Fact) ON (f.embedding)
    OPTIONS { 
        indexConfig: {
            \`vector.dimensions\`: $dimensions,
            \`vector.similarity_function\`: 'cosine'
        }
    }
    `,
    { dimensions: neo4j.int(EMBEDDING_DIMENSION) },
  );
}

export function createConstraints(tx: ManagedTransaction): void {
  tx.run(`
    CREATE CONSTRAINT session_id IF NOT EXISTS
    FOR (s:Session) REQUIRE s.id IS UNIQUE
  `);

  tx.run(`
    CREATE CONSTRAINT message_id IF NOT EXISTS
    FOR (m:Message) REQUIRE m.id IS UNIQUE
  `);

  tx.run(`
    CREATE CONSTRAINT user_id IF NOT EXISTS
    FOR (u:User) REQUIRE u.id IS UNIQUE
  `);

  tx.run(`
    CREATE CONSTRAINT entity_canonical_id IF NOT EXISTS
    FOR (e:Entity) REQUIRE e.canonicalId IS UNIQUE
  `);

  tx.run(`
    CREATE CONSTRAINT fact_id IF NOT EXISTS
    FOR (f:Fact) REQUIRE f.id IS UNIQUE
  `);

  tx.run(`
    CREATE CONSTRAINT tool_call_id IF NOT EXISTS
    FOR (t:ToolCall) REQUIRE t.id IS UNIQUE
  `);
}

export function createIndexes(tx: ManagedTransaction): void {
  tx.run(`
    CREATE INDEX message_ts IF NOT EXISTS
    FOR (m:Message) ON (m.ts)
  `);

  tx.run(`
    CREATE INDEX entity_type_name IF NOT EXISTS
    FOR (e:Entity) ON (e.type, e.name)
  `);

  tx.run(`
    CREATE INDEX tool_call_status IF NOT EXISTS
    FOR (t:ToolCall) ON (t.status)
  `);

  tx.run(`
    CREATE INDEX preference_key IF NOT EXISTS
    FOR (p:Preference) ON (p.key)
  `);
}

export async function initializeSchema(session: Session): Promise<void> {
  await session.executeWrite(createConstraints);
  await session.executeWrite(createIndexes);
  await session.executeWrite(createVectorIndexes);
}
