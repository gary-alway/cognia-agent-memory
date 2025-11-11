import neo4j from "neo4j-driver";
import { NEO4J_PASSWORD, NEO4J_URI, NEO4J_USER } from "../src/core/config.js";
import { getLogger } from "../src/core/logger.js";

const logger = getLogger("verify-schema");

async function verifySchema(): Promise<void> {
    const driver = neo4j.driver(
        NEO4J_URI,
        neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
    );

    try {
        const session = driver.session();

        try {
            logger.info("Checking constraints...");
            const constraintsResult = await session.run("SHOW CONSTRAINTS");
            const constraints = constraintsResult.records.map((r) => r.get("name"));
            logger.info(`✓ Found ${constraints.length} constraints:`, constraints);

            logger.info("\nChecking indexes...");
            const indexesResult = await session.run("SHOW INDEXES");
            const indexes = indexesResult.records.map((r) => r.get("name"));
            logger.info(`✓ Found ${indexes.length} indexes:`, indexes);

      logger.info("\nChecking vector indexes...");
      const vectorIndexNames = ["msg_emb_idx", "fact_emb_idx"];
      const foundVectorIndexes = vectorIndexNames.filter((name) =>
        indexes.includes(name),
      );
      logger.info(
        `✓ Found ${foundVectorIndexes.length} vector indexes:`,
        foundVectorIndexes,
      );

            const expectedConstraints = [
                "session_id",
                "message_id",
                "user_id",
                "entity_canonical_id",
                "fact_id",
                "tool_call_id",
            ];
            const expectedIndexes = [
                "message_ts",
                "entity_type_name",
                "tool_call_status",
                "msg_emb_idx",
                "fact_emb_idx",
            ];

            const missingConstraints = expectedConstraints.filter(
                (c) => !constraints.includes(c),
            );
      const missingIndexes = expectedIndexes.filter(
        (i) => !indexes.includes(i),
      );

      const missingVectorIndexes = vectorIndexNames.filter(
        (i) => !indexes.includes(i),
      );

      if (missingConstraints.length > 0) {
        logger.error("\n✗ Missing constraints:", missingConstraints);
        process.exit(1);
      }

      if (missingIndexes.length > 0) {
        logger.error("\n✗ Missing indexes:", missingIndexes);
        process.exit(1);
      }

      if (missingVectorIndexes.length > 0) {
        logger.error("\n✗ Missing vector indexes:", missingVectorIndexes);
        process.exit(1);
      }

      logger.info("\n✓ All constraints and indexes are present!");
        } finally {
            await session.close();
        }
    } catch (error) {
        logger.error("ERROR:", error);
        process.exit(1);
    } finally {
        await driver.close();
    }
}

verifySchema()
    .then(() => {
        process.exit(0);
    })
    .catch((error) => {
        logger.error("Fatal error:", error);
        process.exit(1);
    });

