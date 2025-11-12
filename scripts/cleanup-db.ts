import { getConnection } from "../src/core/db.js";
import { getLogger } from "../src/core/logger.js";

const logger = getLogger("cleanup-db");

async function cleanupTestData(): Promise<void> {
  const connection = getConnection();
  const session = connection.session();

  try {
    await session.executeWrite(async (tx) => {
      logger.info("Deleting test sessions...");
      const result1 = await tx.run(`
        MATCH (s:Session)
        WHERE s.id STARTS WITH 'test-' 
           OR s.id STARTS WITH 'session-test'
           OR s.id CONTAINS 'mcp-session'
        WITH s, count(s) as sessionCount
        DETACH DELETE s
        RETURN sessionCount
      `);
      const sessionsDeleted = result1.records[0]?.get(0) || 0;
      logger.info(`Deleted ${sessionsDeleted} test sessions`);

      logger.info("Deleting orphaned messages...");
      const result2 = await tx.run(`
        MATCH (m:Message)
        WHERE NOT EXISTS((m)<-[:HAS_MESSAGE]-(:Session))
        WITH m, count(m) as messageCount
        DETACH DELETE m
        RETURN messageCount
      `);
      const messagesDeleted = result2.records[0]?.get(0) || 0;
      logger.info(`Deleted ${messagesDeleted} orphaned messages`);

      logger.info("Deleting orphaned entities...");
      const result3 = await tx.run(`
        MATCH (e:Entity)
        WHERE NOT EXISTS((e)<-[:MENTIONS]-(:Message))
        WITH e, count(e) as entityCount
        DETACH DELETE e
        RETURN entityCount
      `);
      const entitiesDeleted = result3.records[0]?.get(0) || 0;
      logger.info(`Deleted ${entitiesDeleted} orphaned entities`);

      logger.info("Deleting orphaned facts...");
      const result4 = await tx.run(`
        MATCH (f:Fact)
        WHERE NOT EXISTS((f)<-[:EXTRACTED_FACT]-(:Message))
        WITH f, count(f) as factCount
        DETACH DELETE f
        RETURN factCount
      `);
      const factsDeleted = result4.records[0]?.get(0) || 0;
      logger.info(`Deleted ${factsDeleted} orphaned facts`);

      logger.info("Deleting orphaned tool calls...");
      const result5 = await tx.run(`
        MATCH (t:ToolCall)
        WHERE NOT EXISTS((t)<-[:USED_TOOL]-(:Message))
        WITH t, count(t) as toolCount
        DETACH DELETE t
        RETURN toolCount
      `);
      const toolsDeleted = result5.records[0]?.get(0) || 0;
      logger.info(`Deleted ${toolsDeleted} orphaned tool calls`);

      logger.info("Deleting users with no sessions...");
      const result6 = await tx.run(`
        MATCH (u:User)
        WHERE NOT EXISTS((u)-[:HAS_SESSION]->(:Session))
        WITH u, count(u) as userCount
        DETACH DELETE u
        RETURN userCount
      `);
      const usersDeleted = result6.records[0]?.get(0) || 0;
      logger.info(`Deleted ${usersDeleted} users with no sessions`);

      logger.info("✓ Database cleanup completed successfully");
    });
  } catch (error) {
    logger.error("Failed to cleanup database:", error);
    throw error;
  } finally {
    await session.close();
    await connection.close();
  }
}

cleanupTestData()
  .then(() => {
    console.log("\n✓ Cleanup complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n✗ Cleanup failed:", error);
    process.exit(1);
  });

