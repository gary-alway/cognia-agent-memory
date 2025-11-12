import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionData } from "../archival/archival.js";

const mockGenerateEmbedding = vi.fn();
const mockArchivalService = {
  listArchivedSessions: vi.fn(),
  retrieveSession: vi.fn(),
};

vi.mock("../clients/embeddings.js", () => ({
  getEmbeddingsClient: vi.fn(() => ({
    generateEmbedding: mockGenerateEmbedding,
  })),
}));

vi.mock("../core/logger.js", () => ({
  getLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock("../archival/archival.js", () => ({
  getArchivalService: vi.fn(() => mockArchivalService),
}));

describe("archived_retrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateEmbedding.mockResolvedValue(new Array(1024).fill(0.1));
  });

  describe("recallFromArchived with stored embeddings", () => {
    it("should use stored embeddings when available", async () => {
      const { recallFromArchived } = await import("./archived_retrieval.js");

      const storedEmbedding = new Array(1024).fill(0.5);
      const sessionData: SessionData = {
        id: "session-1",
        messages: [
          {
            id: "msg-1",
            role: "user",
            text: "Hello world",
            ts: new Date().toISOString(),
            embedding: storedEmbedding,
          },
        ],
        entities: [],
        tools: [],
      };

      mockArchivalService.listArchivedSessions.mockResolvedValue([
        "sessions/session-1.json",
      ]);
      mockArchivalService.retrieveSession.mockResolvedValue(sessionData);

      const queryEmbedding = new Array(1024).fill(0.1);
      const results = await recallFromArchived(queryEmbedding, 10, 10);

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].text).toBe("Hello world");
      expect(mockGenerateEmbedding).not.toHaveBeenCalled();
    });

    it("should generate embeddings on-the-fly for messages without stored embeddings", async () => {
      const { recallFromArchived } = await import("./archived_retrieval.js");

      const sessionData: SessionData = {
        id: "session-1",
        messages: [
          {
            id: "msg-1",
            role: "user",
            text: "Hello world",
            ts: new Date().toISOString(),
            // No embedding field
          },
        ],
        entities: [],
        tools: [],
      };

      mockArchivalService.listArchivedSessions.mockResolvedValue([
        "sessions/session-1.json",
      ]);
      mockArchivalService.retrieveSession.mockResolvedValue(sessionData);

      const queryEmbedding = new Array(1024).fill(0.1);
      const results = await recallFromArchived(queryEmbedding, 10, 10);

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
      expect(mockGenerateEmbedding).toHaveBeenCalledTimes(1);
      expect(mockGenerateEmbedding).toHaveBeenCalledWith("Hello world");
    });

    it("should handle mixed embeddings (some stored, some not)", async () => {
      const { recallFromArchived } = await import("./archived_retrieval.js");

      const storedEmbedding = new Array(1024).fill(0.5);
      const sessionData: SessionData = {
        id: "session-1",
        messages: [
          {
            id: "msg-1",
            role: "user",
            text: "Message with stored embedding",
            ts: new Date().toISOString(),
            embedding: storedEmbedding,
          },
          {
            id: "msg-2",
            role: "assistant",
            text: "Message without embedding",
            ts: new Date().toISOString(),
            // No embedding
          },
        ],
        entities: [],
        tools: [],
      };

      mockArchivalService.listArchivedSessions.mockResolvedValue([
        "sessions/session-1.json",
      ]);
      mockArchivalService.retrieveSession.mockResolvedValue(sessionData);

      const queryEmbedding = new Array(1024).fill(0.1);
      const results = await recallFromArchived(queryEmbedding, 10, 10);

      expect(results).toBeDefined();
      expect(results.length).toBe(2);
      expect(mockGenerateEmbedding).toHaveBeenCalledTimes(1);
      expect(mockGenerateEmbedding).toHaveBeenCalledWith(
        "Message without embedding",
      );
    });

    it("should reject embeddings with wrong dimension", async () => {
      const { recallFromArchived } = await import("./archived_retrieval.js");

      const wrongDimensionEmbedding = new Array(512).fill(0.5);
      const sessionData: SessionData = {
        id: "session-1",
        messages: [
          {
            id: "msg-1",
            role: "user",
            text: "Message with wrong dimension embedding",
            ts: new Date().toISOString(),
            embedding: wrongDimensionEmbedding,
          },
        ],
        entities: [],
        tools: [],
      };

      mockArchivalService.listArchivedSessions.mockResolvedValue([
        "sessions/session-1.json",
      ]);
      mockArchivalService.retrieveSession.mockResolvedValue(sessionData);

      const queryEmbedding = new Array(1024).fill(0.1);
      const results = await recallFromArchived(queryEmbedding, 10, 10);

      expect(results).toBeDefined();
      expect(mockGenerateEmbedding).toHaveBeenCalledTimes(1);
    });

    it("should return empty array when no archived sessions exist", async () => {
      const { recallFromArchived } = await import("./archived_retrieval.js");

      mockArchivalService.listArchivedSessions.mockResolvedValue([]);

      const queryEmbedding = new Array(1024).fill(0.1);
      const results = await recallFromArchived(queryEmbedding, 10, 10);

      expect(results).toEqual([]);
    });

    it("should handle multiple sessions and sort by score", async () => {
      const { recallFromArchived } = await import("./archived_retrieval.js");

      const highScoreEmbedding = new Array(1024).fill(0.9);
      const lowScoreEmbedding = new Array(1024).fill(0.1);

      const session1: SessionData = {
        id: "session-1",
        messages: [
          {
            id: "msg-1",
            role: "user",
            text: "Low score message",
            ts: new Date().toISOString(),
            embedding: lowScoreEmbedding,
          },
        ],
        entities: [],
        tools: [],
      };

      const session2: SessionData = {
        id: "session-2",
        messages: [
          {
            id: "msg-2",
            role: "user",
            text: "High score message",
            ts: new Date().toISOString(),
            embedding: highScoreEmbedding,
          },
        ],
        entities: [],
        tools: [],
      };

      mockArchivalService.listArchivedSessions.mockResolvedValue([
        "sessions/session-1.json",
        "sessions/session-2.json",
      ]);
      mockArchivalService.retrieveSession
        .mockResolvedValueOnce(session1)
        .mockResolvedValueOnce(session2);

      const queryEmbedding = new Array(1024).fill(0.9);
      const results = await recallFromArchived(queryEmbedding, 10, 10);

      expect(results).toBeDefined();
      expect(results.length).toBe(2);
      // Results should be sorted by score (descending)
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
      // Both messages should be present
      const texts = results.map((r) => r.text);
      expect(texts).toContain("High score message");
      expect(texts).toContain("Low score message");
    });

    it("should skip messages with empty text", async () => {
      const { recallFromArchived } = await import("./archived_retrieval.js");

      const sessionData: SessionData = {
        id: "session-1",
        messages: [
          {
            id: "msg-1",
            role: "user",
            text: "",
            ts: new Date().toISOString(),
            embedding: new Array(1024).fill(0.5),
          },
          {
            id: "msg-2",
            role: "user",
            text: "Valid message",
            ts: new Date().toISOString(),
            embedding: new Array(1024).fill(0.5),
          },
        ],
        entities: [],
        tools: [],
      };

      mockArchivalService.listArchivedSessions.mockResolvedValue([
        "sessions/session-1.json",
      ]);
      mockArchivalService.retrieveSession.mockResolvedValue(sessionData);

      const queryEmbedding = new Array(1024).fill(0.1);
      const results = await recallFromArchived(queryEmbedding, 10, 10);

      expect(results).toBeDefined();
      expect(results.length).toBe(1);
      expect(results[0].text).toBe("Valid message");
    });
  });
});
