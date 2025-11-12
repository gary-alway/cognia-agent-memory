import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session, ManagedTransaction } from "neo4j-driver";
import {
  ArchivalService,
  archiveOldSessions,
  getOldSessions,
  getArchivalService,
  restoreSessionToNeo4j,
} from "./archival.js";

vi.mock("minio", () => {
  return {
    Client: vi.fn().mockImplementation(() => ({
      bucketExists: vi.fn(),
      makeBucket: vi.fn(),
      putObject: vi.fn(),
      getObject: vi.fn(),
      listObjects: vi.fn(),
      statObject: vi.fn(),
    })),
  };
});

const mockGenerateEmbedding = vi
  .fn()
  .mockResolvedValue(new Array(1024).fill(0.1));

vi.mock("../clients/embeddings.js", () => ({
  getEmbeddingsClient: vi.fn(() => ({
    generateEmbedding: mockGenerateEmbedding,
  })),
}));

vi.mock("../memory/entities.js", () => ({
  extractAndStoreEntities: vi.fn().mockResolvedValue([]),
  createEntityId: vi.fn((type, name) => `${type}:${name}`),
}));

vi.mock("../memory/facts.js", () => ({
  extractAndStoreFacts: vi.fn().mockResolvedValue([]),
}));

vi.mock("../memory/tools.js", () => ({
  storeToolCall: vi.fn().mockReturnValue("tool-call-id"),
}));

describe("archival", () => {
  let mockSession: Session;
  let mockTx: ManagedTransaction;
  let mockMinioClient: {
    bucketExists: ReturnType<typeof vi.fn>;
    makeBucket: ReturnType<typeof vi.fn>;
    putObject: ReturnType<typeof vi.fn>;
    getObject: ReturnType<typeof vi.fn>;
    listObjects: ReturnType<typeof vi.fn>;
    statObject: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    mockMinioClient = {
      bucketExists: vi.fn().mockResolvedValue(true),
      makeBucket: vi.fn().mockResolvedValue(undefined),
      putObject: vi.fn().mockResolvedValue(undefined),
      getObject: vi.fn(),
      listObjects: vi.fn(),
      statObject: vi.fn().mockResolvedValue({
        lastModified: new Date("2024-01-01T00:00:00Z"),
      }),
    };

    const { Client } = await import("minio");
    (Client as ReturnType<typeof vi.fn>).mockImplementation(
      () => mockMinioClient,
    );

    mockTx = {
      run: vi.fn(),
    } as unknown as ManagedTransaction;

    mockSession = {
      executeRead: vi.fn((callback) => callback(mockTx)),
      executeWrite: vi.fn((callback) => callback(mockTx)),
    } as unknown as Session;
  });

  describe("ArchivalService", () => {
    it("should create bucket if it doesn't exist", async () => {
      mockMinioClient.bucketExists.mockResolvedValue(false);

      new ArchivalService();
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockMinioClient.bucketExists).toHaveBeenCalled();
      expect(mockMinioClient.makeBucket).toHaveBeenCalled();
    });

    it("should not create bucket if it exists", async () => {
      mockMinioClient.bucketExists.mockResolvedValue(true);

      new ArchivalService();
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockMinioClient.bucketExists).toHaveBeenCalled();
      expect(mockMinioClient.makeBucket).not.toHaveBeenCalled();
    });

    it("should archive a session", async () => {
      const service = new ArchivalService();
      const sessionData = {
        id: "session-1",
        messages: [
          { id: "msg-1", role: "user", text: "Hello", ts: "2024-01-01" },
        ],
        entities: [],
        tools: [],
      };

      const objectName = await service.archiveSession(sessionData);

      expect(objectName).toContain("sessions/session-1");
      expect(objectName).toContain(".json");
      expect(mockMinioClient.putObject).toHaveBeenCalled();
    });

    it("should archive session with embeddings", async () => {
      const service = new ArchivalService();
      const mockEmbedding = new Array(1024).fill(0.1);
      const sessionData = {
        id: "session-1",
        messages: [
          {
            id: "msg-1",
            role: "user",
            text: "Hello",
            ts: "2024-01-01",
            embedding: mockEmbedding,
          },
        ],
        entities: [],
        tools: [],
      };

      await service.archiveSession(sessionData);

      expect(mockMinioClient.putObject).toHaveBeenCalled();
      const putCall = mockMinioClient.putObject.mock.calls[0];
      const storedBuffer = putCall[2] as Buffer;
      const storedData = JSON.parse(storedBuffer.toString("utf-8"));
      expect(storedData.messages[0].embedding).toEqual(mockEmbedding);
      expect(storedData.messages[0].embedding).toHaveLength(1024);
    });

    it("should archive session with mixed embeddings", async () => {
      const service = new ArchivalService();
      const mockEmbedding = new Array(1024).fill(0.1);
      const sessionData = {
        id: "session-1",
        messages: [
          {
            id: "msg-1",
            role: "user",
            text: "Hello",
            ts: "2024-01-01",
            embedding: mockEmbedding,
          },
          {
            id: "msg-2",
            role: "assistant",
            text: "Hi",
            ts: "2024-01-01",
          },
        ],
        entities: [],
        tools: [],
      };

      await service.archiveSession(sessionData);

      expect(mockMinioClient.putObject).toHaveBeenCalled();
      const putCall = mockMinioClient.putObject.mock.calls[0];
      const storedBuffer = putCall[2] as Buffer;
      const storedData = JSON.parse(storedBuffer.toString("utf-8"));
      expect(storedData.messages[0].embedding).toEqual(mockEmbedding);
      expect(storedData.messages[1].embedding).toBeUndefined();
    });

    it("should retrieve a session", async () => {
      const service = new ArchivalService();
      const sessionData = {
        id: "session-1",
        messages: [],
        entities: [],
        tools: [],
      };

      const mockStream = {
        on: vi.fn((event: string, callback: (data?: Buffer) => void) => {
          if (event === "data") {
            callback(Buffer.from(JSON.stringify(sessionData)));
          } else if (event === "end") {
            callback();
          }
          return mockStream;
        }),
      };

      mockMinioClient.getObject.mockResolvedValue(mockStream);

      const result = await service.retrieveSession(
        "sessions/session-1/123.json",
      );

      expect(result.id).toBe("session-1");
    });

    it("should list archived sessions", async () => {
      const service = new ArchivalService();
      const mockObjects = [
        { name: "sessions/session-1/123.json" },
        { name: "sessions/session-2/456.json" },
      ];

      const mockStream = {
        on: vi.fn(
          (event: string, callback: (obj?: { name: string }) => void) => {
            if (event === "data") {
              mockObjects.forEach((obj) => callback(obj));
            } else if (event === "end") {
              callback();
            }
            return mockStream;
          },
        ),
      };

      mockMinioClient.listObjects.mockReturnValue(mockStream);

      const result = await service.listArchivedSessions();

      expect(result).toHaveLength(2);
      expect(result[0]).toBe("sessions/session-1/123.json");
    });

    it("should list archived sessions with metadata", async () => {
      const service = new ArchivalService();
      const mockObjects = [
        { name: "sessions/session-1/2024-01-01T00:00:00.000Z.json" },
        { name: "sessions/session-2/2024-01-02T00:00:00.000Z.json" },
      ];

      const sessionData1 = {
        id: "session-1",
        messages: [
          { id: "msg-1", role: "user", text: "Hello", ts: "2024-01-01" },
        ],
        entities: [],
        tools: [],
      };

      const sessionData2 = {
        id: "session-2",
        messages: [
          { id: "msg-2", role: "user", text: "Hi", ts: "2024-01-02" },
          { id: "msg-3", role: "assistant", text: "Hello!", ts: "2024-01-02" },
        ],
        entities: [],
        tools: [],
      };

      const mockStream = {
        on: vi.fn(
          (event: string, callback: (obj?: { name: string }) => void) => {
            if (event === "data") {
              mockObjects.forEach((obj) => callback(obj));
            } else if (event === "end") {
              callback();
            }
            return mockStream;
          },
        ),
      };

      const mockGetObjectStream1 = {
        on: vi.fn((event: string, callback: (data?: Buffer) => void) => {
          if (event === "data") {
            callback(Buffer.from(JSON.stringify(sessionData1)));
          } else if (event === "end") {
            callback();
          }
          return mockGetObjectStream1;
        }),
      };

      const mockGetObjectStream2 = {
        on: vi.fn((event: string, callback: (data?: Buffer) => void) => {
          if (event === "data") {
            callback(Buffer.from(JSON.stringify(sessionData2)));
          } else if (event === "end") {
            callback();
          }
          return mockGetObjectStream2;
        }),
      };

      mockMinioClient.listObjects.mockReturnValue(mockStream);
      mockMinioClient.getObject
        .mockResolvedValueOnce(mockGetObjectStream1)
        .mockResolvedValueOnce(mockGetObjectStream2);

      mockMinioClient.statObject
        .mockResolvedValueOnce({
          lastModified: new Date("2024-01-01T00:00:00Z"),
        })
        .mockResolvedValueOnce({
          lastModified: new Date("2024-01-02T00:00:00Z"),
        });

      const result = await service.listArchivedSessionsWithMetadata();

      expect(result).toHaveLength(2);
      expect(result[0].sessionId).toBe("session-2");
      expect(result[0].messageCount).toBe(2);
      expect(result[1].sessionId).toBe("session-1");
      expect(result[1].messageCount).toBe(1);
      expect(mockMinioClient.statObject).toHaveBeenCalledTimes(2);
    });

    it("should archive tool traces", async () => {
      const service = new ArchivalService();
      const traces = [
        { tool: "api", timestamp: "2024-01-01", status: "success" },
      ];

      const objectName = await service.archiveToolTraces(traces);

      expect(objectName).toContain("traces");
      expect(objectName).toContain(".json");
      expect(mockMinioClient.putObject).toHaveBeenCalled();
    });
  });

  describe("getOldSessions", () => {
    it("should retrieve old sessions", async () => {
      const mockRecords = [
        {
          get: vi.fn((key: string) => {
            const values: Record<string, unknown> = {
              session_id: "session-1",
              messages: [
                { id: "msg-1", role: "user", text: "Hello", ts: "2024-01-01" },
              ],
              entities: [{ type: "PERSON", name: "John" }],
              tools: [{ name: "tool1", status: "success" }],
            };
            return values[key];
          }),
        },
      ];

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: mockRecords,
      });

      const result = await getOldSessions(mockTx, 90);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("session-1");
      expect(result[0].messages).toHaveLength(1);
    });

    it("should filter out null/empty values", async () => {
      const mockRecords = [
        {
          get: vi.fn((key: string) => {
            const values: Record<string, unknown> = {
              session_id: "session-1",
              messages: [
                { id: "msg-1", role: "user", text: "Hello", ts: "2024-01-01" },
                { id: null, role: null, text: null, ts: null },
              ],
              entities: [
                { type: "PERSON", name: "John" },
                { type: null, name: null },
              ],
              tools: [
                { name: "tool1", status: "success" },
                { name: null, status: null },
              ],
            };
            return values[key];
          }),
        },
      ];

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: mockRecords,
      });

      const result = await getOldSessions(mockTx, 90);

      expect(result[0].messages).toHaveLength(1);
      expect(result[0].entities).toHaveLength(1);
      expect(result[0].tools).toHaveLength(1);
    });

    it("should include embeddings when fetching old sessions", async () => {
      const mockEmbedding = new Array(1024).fill(0.1);
      const mockRecords = [
        {
          get: vi.fn((key: string) => {
            const values: Record<string, unknown> = {
              session_id: "session-1",
              messages: [
                {
                  id: "msg-1",
                  role: "user",
                  text: "Hello",
                  ts: "2024-01-01",
                  embedding: mockEmbedding,
                },
              ],
              entities: [],
              tools: [],
            };
            return values[key];
          }),
        },
      ];

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: mockRecords,
      });

      const result = await getOldSessions(mockTx, 90);

      expect(result).toHaveLength(1);
      expect(result[0].messages[0].embedding).toEqual(mockEmbedding);
      expect(result[0].messages[0].embedding).toHaveLength(1024);
    });

    it("should handle messages without embeddings", async () => {
      const mockRecords = [
        {
          get: vi.fn((key: string) => {
            const values: Record<string, unknown> = {
              session_id: "session-1",
              messages: [
                {
                  id: "msg-1",
                  role: "user",
                  text: "Hello",
                  ts: "2024-01-01",
                  embedding: undefined,
                },
                {
                  id: "msg-2",
                  role: "assistant",
                  text: "Hi",
                  ts: "2024-01-01",
                },
              ],
              entities: [],
              tools: [],
            };
            return values[key];
          }),
        },
      ];

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: mockRecords,
      });

      const result = await getOldSessions(mockTx, 90);

      expect(result).toHaveLength(1);
      expect(result[0].messages).toHaveLength(2);
      expect(result[0].messages[0].embedding).toBeUndefined();
      expect(result[0].messages[1].embedding).toBeUndefined();
    });

    it("should handle mixed messages with and without embeddings", async () => {
      const mockEmbedding = new Array(1024).fill(0.1);
      const mockRecords = [
        {
          get: vi.fn((key: string) => {
            const values: Record<string, unknown> = {
              session_id: "session-1",
              messages: [
                {
                  id: "msg-1",
                  role: "user",
                  text: "Hello",
                  ts: "2024-01-01",
                  embedding: mockEmbedding,
                },
                {
                  id: "msg-2",
                  role: "assistant",
                  text: "Hi",
                  ts: "2024-01-01",
                  embedding: undefined,
                },
              ],
              entities: [],
              tools: [],
            };
            return values[key];
          }),
        },
      ];

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: mockRecords,
      });

      const result = await getOldSessions(mockTx, 90);

      expect(result).toHaveLength(1);
      expect(result[0].messages).toHaveLength(2);
      expect(result[0].messages[0].embedding).toEqual(mockEmbedding);
      expect(result[0].messages[1].embedding).toBeUndefined();
    });
  });

  describe("archiveOldSessions", () => {
    it("should archive old sessions", async () => {
      const mockRecords = [
        {
          get: vi.fn((key: string) => {
            const values: Record<string, unknown> = {
              session_id: "session-1",
              messages: [],
              entities: [],
              tools: [],
            };
            return values[key];
          }),
        },
      ];

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: mockRecords,
      });

      const service = new ArchivalService();
      const count = await archiveOldSessions(mockSession, service, 90);

      expect(count).toBe(1);
      expect(mockMinioClient.putObject).toHaveBeenCalled();
    });

    it("should handle archiving errors gracefully", async () => {
      const mockRecords = [
        {
          get: vi.fn((key: string) => {
            const values: Record<string, unknown> = {
              session_id: "session-1",
              messages: [],
              entities: [],
              tools: [],
            };
            return values[key];
          }),
        },
      ];

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: mockRecords,
      });

      mockMinioClient.putObject.mockRejectedValue(new Error("Archive failed"));

      const service = new ArchivalService();
      const count = await archiveOldSessions(mockSession, service, 90);

      expect(count).toBe(0);
    });
  });

  describe("getArchivalService", () => {
    it("should return singleton instance", () => {
      const service1 = getArchivalService();
      const service2 = getArchivalService();

      expect(service1).toBe(service2);
    });
  });

  describe("restoreSessionToNeo4j", () => {
    it("should restore a session to Neo4j", async () => {
      const sessionData = {
        id: "session-1",
        messages: [
          {
            id: "msg-1",
            role: "user",
            text: "Hello",
            ts: "2024-01-01T00:00:00.000Z",
          },
          {
            id: "msg-2",
            role: "assistant",
            text: "Hi there!",
            ts: "2024-01-01T00:01:00.000Z",
          },
        ],
        entities: [],
        tools: [],
      };

      const result = await restoreSessionToNeo4j(mockSession, sessionData);

      expect(result.messageCount).toBe(2);
      expect(result.entityCount).toBe(0);
      expect(result.toolCount).toBe(0);
      expect(mockSession.executeWrite).toHaveBeenCalled();
    });

    it("should restore session with tools but not restore tools", async () => {
      const sessionData = {
        id: "session-1",
        messages: [
          {
            id: "msg-1",
            role: "assistant",
            text: "I'll call a tool",
            ts: "2024-01-01T00:00:00.000Z",
          },
        ],
        entities: [],
        tools: [{ name: "test_tool", status: "success", latency: 100 }],
      };

      const result = await restoreSessionToNeo4j(mockSession, sessionData);

      expect(result.messageCount).toBe(1);
      expect(result.toolCount).toBe(0);
    });

    it("should handle invalid timestamps gracefully", async () => {
      const sessionData = {
        id: "session-1",
        messages: [
          {
            id: "msg-1",
            role: "user",
            text: "Hello",
            ts: "invalid-date",
          },
          {
            id: "msg-2",
            role: "assistant",
            text: "Hi",
            ts: "2024-01-01T00:00:00.000Z",
          },
        ],
        entities: [],
        tools: [],
      };

      const result = await restoreSessionToNeo4j(mockSession, sessionData);

      expect(result.messageCount).toBe(2);
      expect(mockSession.executeWrite).toHaveBeenCalled();
    });

    it("should batch all messages in single transaction", async () => {
      const sessionData = {
        id: "session-1",
        messages: Array.from({ length: 10 }, (_, i) => ({
          id: `msg-${i}`,
          role: i % 2 === 0 ? "user" : "assistant",
          text: `Message ${i}`,
          ts: `2024-01-01T00:0${i}:00.000Z`,
        })),
        entities: [],
        tools: [],
      };

      await restoreSessionToNeo4j(mockSession, sessionData);

      expect(mockSession.executeWrite).toHaveBeenCalledTimes(1);
    });

    it("should use stored embeddings when available", async () => {
      const storedEmbedding1 = new Array(1024).fill(0.5);
      const storedEmbedding2 = new Array(1024).fill(0.7);

      const sessionData = {
        id: "session-1",
        messages: [
          {
            id: "msg-1",
            role: "user",
            text: "Hello",
            ts: "2024-01-01T00:00:00.000Z",
            embedding: storedEmbedding1,
          },
          {
            id: "msg-2",
            role: "assistant",
            text: "Hi there!",
            ts: "2024-01-01T00:01:00.000Z",
            embedding: storedEmbedding2,
          },
        ],
        entities: [],
        tools: [],
      };

      const result = await restoreSessionToNeo4j(mockSession, sessionData);

      expect(result.messageCount).toBe(2);
      expect(mockGenerateEmbedding).not.toHaveBeenCalled();
    });

    it("should generate embeddings on-the-fly for messages without stored embeddings", async () => {
      const sessionData = {
        id: "session-1",
        messages: [
          {
            id: "msg-1",
            role: "user",
            text: "Hello",
            ts: "2024-01-01T00:00:00.000Z",
            // No embedding
          },
        ],
        entities: [],
        tools: [],
      };

      const result = await restoreSessionToNeo4j(mockSession, sessionData);

      expect(result.messageCount).toBe(1);
      expect(mockGenerateEmbedding).toHaveBeenCalledTimes(1);
      expect(mockGenerateEmbedding).toHaveBeenCalledWith("Hello");
    });

    it("should handle mixed embeddings (some stored, some not)", async () => {
      const storedEmbedding = new Array(1024).fill(0.5);

      const sessionData = {
        id: "session-1",
        messages: [
          {
            id: "msg-1",
            role: "user",
            text: "Message with embedding",
            ts: "2024-01-01T00:00:00.000Z",
            embedding: storedEmbedding,
          },
          {
            id: "msg-2",
            role: "assistant",
            text: "Message without embedding",
            ts: "2024-01-01T00:01:00.000Z",
            // No embedding
          },
        ],
        entities: [],
        tools: [],
      };

      const result = await restoreSessionToNeo4j(mockSession, sessionData);

      expect(result.messageCount).toBe(2);
      expect(mockGenerateEmbedding).toHaveBeenCalledTimes(1);
      expect(mockGenerateEmbedding).toHaveBeenCalledWith(
        "Message without embedding",
      );
    });

    it("should reject embeddings with wrong dimension", async () => {
      const wrongDimensionEmbedding = new Array(512).fill(0.5);

      const sessionData = {
        id: "session-1",
        messages: [
          {
            id: "msg-1",
            role: "user",
            text: "Message with wrong dimension",
            ts: "2024-01-01T00:00:00.000Z",
            embedding: wrongDimensionEmbedding,
          },
        ],
        entities: [],
        tools: [],
      };

      const result = await restoreSessionToNeo4j(mockSession, sessionData);

      expect(result.messageCount).toBe(1);
      expect(mockGenerateEmbedding).toHaveBeenCalledTimes(1);
    });
  });
});
