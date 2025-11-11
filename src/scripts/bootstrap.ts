import neo4j from "neo4j-driver";
import { NEO4J_PASSWORD, NEO4J_URI, NEO4J_USER } from "../core/config.js";
import { getLogger } from "../core/logger.js";
import { initializeSchema } from "../core/schema.js";

const logger = getLogger("bootstrap");

async function waitForNeo4j(maxRetries = 30, delayMs = 1000): Promise<boolean> {
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
  );

  for (let i = 0; i < maxRetries; i++) {
    try {
      await driver.verifyConnectivity();
      return true;
    } catch (error) {
      if (i < maxRetries - 1) {
        logger.info(
          `Waiting for Neo4j to be ready... (attempt ${i + 1}/${maxRetries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  driver.close();
  return false;
}

async function bootstrap(): Promise<void> {
  logger.info("Starting schema bootstrap...");

  const isReady = await waitForNeo4j();
  if (!isReady) {
    logger.error("ERROR: Neo4j is not ready after maximum retries");
    process.exit(1);
  }

  logger.info("✓ Neo4j is ready");

  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
  );

  try {
    const session = driver.session();
    try {
      await initializeSchema(session);
      logger.info("✓ Schema bootstrap complete");
    } finally {
      await session.close();
    }
  } catch (error) {
    logger.error("ERROR: Failed to initialize schema:", error);
    await driver.close();
    process.exit(1);
  } finally {
    await driver.close();
  }
}

bootstrap()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    logger.error("Fatal error:", error);
    process.exit(1);
  });
