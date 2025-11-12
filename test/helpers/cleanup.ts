import { getConnection } from "../../src/core/db.js";

export async function cleanupTestData(): Promise<void> {
  const connection = getConnection();
  const session = connection.session();

  try {
    await session.executeWrite(async (tx) => {
      await tx.run(`
        MATCH (s:Session)
        WHERE s.id STARTS WITH 'test-' 
           OR s.id STARTS WITH 'session-test'
           OR s.id CONTAINS 'mcp-session'
        DETACH DELETE s
      `);

      await tx.run(`
        MATCH (m:Message)
        WHERE NOT EXISTS((m)<-[:HAS_MESSAGE]-(:Session))
        DETACH DELETE m
      `);

      await tx.run(`
        MATCH (e:Entity)
        WHERE NOT EXISTS((e)<-[:MENTIONS]-(:Message))
        DETACH DELETE e
      `);

      await tx.run(`
        MATCH (f:Fact)
        WHERE NOT EXISTS((f)<-[:EXTRACTED_FACT]-(:Message))
        DETACH DELETE f
      `);

      await tx.run(`
        MATCH (t:ToolCall)
        WHERE NOT EXISTS((t)<-[:USED_TOOL]-(:Message))
        DETACH DELETE t
      `);

      await tx.run(`
        MATCH (u:User)
        WHERE NOT EXISTS((u)-[:HAS_SESSION]->(:Session))
        DETACH DELETE u
      `);
    });
  } finally {
    await session.close();
  }
}
