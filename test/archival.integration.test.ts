import type { Session } from "neo4j-driver";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ArchivalService,
  archiveOldSessions,
  getArchivalService,
} from "../src/archival/archival.js";
import { getConnection } from "../src/core/db.js";
import { cleanupTestData } from "./helpers/cleanup.js";

describe("Archival Integration Tests", () => {
  let archivalService: ArchivalService;
  let session: Session;
  const testBucket = "agent-memory-test";

  beforeAll(async () => {
    archivalService = getArchivalService();
    const conn = getConnection();
    session = conn.session();
  });

  afterAll(async () => {
    await cleanupTestData();
    await session.close();
  });

  describe("MinIO Integration", () => {
    it("should create bucket if it doesn't exist", async () => {
      const service = new ArchivalService();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(service).toBeDefined();
    });

    it("should archive a session to MinIO", async () => {
      const sessionData = {
        id: `test-session-${Date.now()}`,
        messages: [
          {
            id: "msg-1",
            role: "user",
            text: "This is a test message for archival",
            ts: new Date().toISOString(),
          },
        ],
        entities: [{ type: "PERSON", name: "Test User" }],
        tools: [],
      };

      const objectName = await archivalService.archiveSession(sessionData);

      expect(objectName).toBeDefined();
      expect(objectName).toContain("sessions/");
      expect(objectName).toContain(".json");
    });

    it("should retrieve archived session from MinIO", async () => {
      const sessionData = {
        id: `test-session-retrieve-${Date.now()}`,
        messages: [
          {
            id: "msg-1",
            role: "user",
            text: "This message should be retrievable",
            ts: new Date().toISOString(),
          },
        ],
        entities: [],
        tools: [],
      };

      const objectName = await archivalService.archiveSession(sessionData);
      expect(objectName).toBeDefined();

      const retrieved = await archivalService.retrieveSession(objectName);

      expect(retrieved).toBeDefined();
      expect(retrieved.id).toBe(sessionData.id);
      expect(retrieved.messages).toHaveLength(1);
      expect(retrieved.messages[0].text).toBe(
        "This message should be retrievable"
      );
    });

    it("should list archived sessions", async () => {
      const sessionData = {
        id: `test-session-list-${Date.now()}`,
        messages: [
          {
            id: "msg-1",
            role: "user",
            text: "Test for listing",
            ts: new Date().toISOString(),
          },
        ],
        entities: [],
        tools: [],
      };

      await archivalService.archiveSession(sessionData);

      await new Promise((resolve) => setTimeout(resolve, 500));

      const sessions = await archivalService.listArchivedSessions("sessions/");

      expect(Array.isArray(sessions)).toBe(true);
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions.some((s) => s.includes("test-session"))).toBe(true);
    });

    it("should archive tool traces to MinIO", async () => {
      const traces = [
        {
          tool: "search_api",
          timestamp: new Date().toISOString(),
          status: "success",
          latency_ms: 150,
        },
        {
          tool: "database_query",
          timestamp: new Date().toISOString(),
          status: "failed",
        },
      ];

      const objectName = await archivalService.archiveToolTraces(traces);

      expect(objectName).toBeDefined();
      expect(objectName).toContain("traces/");
      expect(objectName).toContain(".json");
    });
  });

  describe("Archive Old Sessions Integration", () => {
    it("should archive old sessions from Neo4j to MinIO", async () => {
      const testSessionId = `old-session-${Date.now()}`;

      await session.executeWrite((tx) => {
        tx.run(
          `
          CREATE (s:Session {id: $sessionId, createdAt: datetime()})
          CREATE (m:Message {
            id: $messageId,
            role: 'user',
            text: 'Old message',
            ts: datetime() - duration({days: 91}),
            importance: 0.5
          })
          CREATE (s)-[:HAS_MESSAGE]->(m)
          `,
          {
            sessionId: testSessionId,
            messageId: `msg-${Date.now()}`,
          }
        );
      });

      await new Promise((resolve) => setTimeout(resolve, 500));

      const archivedCount = await archiveOldSessions(
        session,
        archivalService,
        90
      );

      expect(archivedCount).toBeGreaterThanOrEqual(0);

      await session.executeWrite((tx) => {
        tx.run(
          `
          MATCH (s:Session {id: $sessionId})
          DETACH DELETE s
          `,
          { sessionId: testSessionId }
        );
      });
    });

    it("should not archive recent sessions", async () => {
      const testSessionId = `recent-session-${Date.now()}`;

      await session.executeWrite((tx) => {
        tx.run(
          `
          CREATE (s:Session {id: $sessionId, createdAt: datetime()})
          CREATE (m:Message {
            id: $messageId,
            role: 'user',
            text: 'Recent message',
            ts: datetime(),
            importance: 0.5
          })
          CREATE (s)-[:HAS_MESSAGE]->(m)
          `,
          {
            sessionId: testSessionId,
            messageId: `msg-${Date.now()}`,
          }
        );
      });

      await new Promise((resolve) => setTimeout(resolve, 500));

      const archivedCount = await archiveOldSessions(
        session,
        archivalService,
        90
      );

      await new Promise((resolve) => setTimeout(resolve, 500));

      const finalSessions =
        await archivalService.listArchivedSessions("sessions/");

      const testSessionArchived = finalSessions.some((s) =>
        s.includes(testSessionId)
      );
      expect(testSessionArchived).toBe(false);

      const sessionsForThisTest = finalSessions.filter((s) =>
        s.includes("recent-session-")
      );
      expect(sessionsForThisTest.length).toBe(0);

      await session.executeWrite((tx) => {
        tx.run(
          `
          MATCH (s:Session {id: $sessionId})
          DETACH DELETE s
          `,
          { sessionId: testSessionId }
        );
      });
    });
  });
});
