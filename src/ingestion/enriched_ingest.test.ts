import type { ManagedTransaction, Session } from "neo4j-driver";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEmbeddingsClient } from "../clients/embeddings.js";
import { EMBEDDING_DIMENSION } from "../core/config.js";
import { extractAndStoreEntities } from "../memory/entities.js";
import { extractAndStoreFacts } from "../memory/facts.js";
import { storeToolCall } from "../memory/tools.js";
import {
  ingestEnrichedMessage,
  ingestWithToolTracking,
} from "./enriched_ingest.js";

vi.mock("../clients/embeddings.js", () => ({
  getEmbeddingsClient: vi.fn(),
}));

vi.mock("../memory/entities.js", () => ({
  extractAndStoreEntities: vi.fn(),
  createEntityId: vi.fn(
    (type: string, name: string) =>
      `${type.toLowerCase()}:${name.toLowerCase().trim()}`,
  ),
}));

vi.mock("../memory/facts.js", () => ({
  extractAndStoreFacts: vi.fn(),
}));

vi.mock("../memory/tools.js", () => ({
  storeToolCall: vi.fn(),
}));

describe("enriched_ingest", () => {
  let mockSession: Session;
  let mockTx: ManagedTransaction;
  let mockEmbeddingsClient: { generateEmbedding: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    mockEmbeddingsClient = {
      generateEmbedding: vi.fn(),
    };

    (getEmbeddingsClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockEmbeddingsClient,
    );

    mockTx = {
      run: vi.fn(),
    } as unknown as ManagedTransaction;

    mockSession = {
      executeWrite: vi.fn((callback) => callback(mockTx)),
    } as unknown as Session;
  });

  describe("ingestEnrichedMessage", () => {
    it("should ingest message with entities and facts", async () => {
      const mockEmbedding = new Array(EMBEDDING_DIMENSION)
        .fill(0)
        .map((_, i) => i * 0.001);
      const mockEntities = [
        { type: "PERSON", name: "John" },
        { type: "ORG", name: "Acme" },
      ];

      mockEmbeddingsClient.generateEmbedding.mockResolvedValue(mockEmbedding);
      (extractAndStoreEntities as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockEntities,
      );
      (extractAndStoreFacts as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const messageId = await ingestEnrichedMessage(
        mockSession,
        "session-1",
        "user",
        "John works at Acme Corp, a technology company that specializes in developing innovative software solutions for enterprise clients worldwide.",
      );

      expect(messageId).toBeDefined();
      expect(mockEmbeddingsClient.generateEmbedding).toHaveBeenCalled();
      expect(extractAndStoreEntities).toHaveBeenCalled();
      expect(extractAndStoreFacts).toHaveBeenCalled();
    });

    it("should skip entity extraction for short text", async () => {
      const mockEmbedding = new Array(EMBEDDING_DIMENSION)
        .fill(0)
        .map((_, i) => i * 0.001);

      mockEmbeddingsClient.generateEmbedding.mockResolvedValue(mockEmbedding);

      await ingestEnrichedMessage(mockSession, "session-1", "user", "Hi");

      expect(extractAndStoreEntities).not.toHaveBeenCalled();
      expect(extractAndStoreFacts).not.toHaveBeenCalled();
    });

    it("should skip fact extraction for short text", async () => {
      const mockEmbedding = new Array(EMBEDDING_DIMENSION)
        .fill(0)
        .map((_, i) => i * 0.001);
      const mockEntities = [{ type: "PERSON", name: "John" }];

      mockEmbeddingsClient.generateEmbedding.mockResolvedValue(mockEmbedding);
      (extractAndStoreEntities as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockEntities,
      );

      await ingestEnrichedMessage(
        mockSession,
        "session-1",
        "user",
        "This is a short message",
      );

      expect(extractAndStoreEntities).toHaveBeenCalled();
      expect(extractAndStoreFacts).not.toHaveBeenCalled();
    });

    it("should use default options", async () => {
      const mockEmbedding = new Array(EMBEDDING_DIMENSION)
        .fill(0)
        .map((_, i) => i * 0.001);
      const mockEntities = [{ type: "PERSON", name: "John" }];

      mockEmbeddingsClient.generateEmbedding.mockResolvedValue(mockEmbedding);
      (extractAndStoreEntities as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockEntities,
      );
      (extractAndStoreFacts as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await ingestEnrichedMessage(
        mockSession,
        "session-1",
        "user",
        "This is a longer message that should trigger both entity and fact extraction because it meets the length requirements.",
      );

      expect(extractAndStoreEntities).toHaveBeenCalled();
      expect(extractAndStoreFacts).toHaveBeenCalled();
    });

    it("should respect extractEntities option", async () => {
      const mockEmbedding = new Array(EMBEDDING_DIMENSION)
        .fill(0)
        .map((_, i) => i * 0.001);

      mockEmbeddingsClient.generateEmbedding.mockResolvedValue(mockEmbedding);

      await ingestEnrichedMessage(
        mockSession,
        "session-1",
        "user",
        "This is a longer message that would normally trigger extraction",
        { extractEntities: false },
      );

      expect(extractAndStoreEntities).not.toHaveBeenCalled();
    });

    it("should respect extractFacts option", async () => {
      const mockEmbedding = new Array(EMBEDDING_DIMENSION)
        .fill(0)
        .map((_, i) => i * 0.001);
      const mockEntities = [{ type: "PERSON", name: "John" }];

      mockEmbeddingsClient.generateEmbedding.mockResolvedValue(mockEmbedding);
      (extractAndStoreEntities as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockEntities,
      );

      await ingestEnrichedMessage(
        mockSession,
        "session-1",
        "user",
        "This is a longer message that would normally trigger fact extraction",
        { extractFacts: false },
      );

      expect(extractAndStoreEntities).toHaveBeenCalled();
      expect(extractAndStoreFacts).not.toHaveBeenCalled();
    });
  });

  describe("ingestWithToolTracking", () => {
    it("should ingest message and track tool call", async () => {
      const mockEmbedding = new Array(EMBEDDING_DIMENSION)
        .fill(0)
        .map((_, i) => i * 0.001);
      const mockEntities = [{ type: "PERSON", name: "John" }];

      mockEmbeddingsClient.generateEmbedding.mockResolvedValue(mockEmbedding);
      (extractAndStoreEntities as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockEntities,
      );
      (storeToolCall as ReturnType<typeof vi.fn>).mockReturnValue("tool-123");

      const [messageId, toolCallId] = await ingestWithToolTracking(
        mockSession,
        "session-1",
        "assistant",
        "I called the API",
        "api_call",
        { endpoint: "/users" },
        "success",
        100,
      );

      expect(messageId).toBeDefined();
      expect(toolCallId).toBe("tool-123");
      expect(storeToolCall).toHaveBeenCalledWith(
        mockTx,
        messageId,
        "api_call",
        { endpoint: "/users" },
        "success",
        100,
      );
    });

    it("should handle missing tool name", async () => {
      const mockEmbedding = new Array(EMBEDDING_DIMENSION)
        .fill(0)
        .map((_, i) => i * 0.001);
      const mockEntities = [{ type: "PERSON", name: "John" }];

      mockEmbeddingsClient.generateEmbedding.mockResolvedValue(mockEmbedding);
      (extractAndStoreEntities as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockEntities,
      );

      const [messageId, toolCallId] = await ingestWithToolTracking(
        mockSession,
        "session-1",
        "assistant",
        "Just a message",
      );

      expect(messageId).toBeDefined();
      expect(toolCallId).toBeNull();
      expect(storeToolCall).not.toHaveBeenCalled();
    });

    it("should use default tool status", async () => {
      const mockEmbedding = new Array(EMBEDDING_DIMENSION)
        .fill(0)
        .map((_, i) => i * 0.001);
      const mockEntities = [{ type: "PERSON", name: "John" }];

      mockEmbeddingsClient.generateEmbedding.mockResolvedValue(mockEmbedding);
      (extractAndStoreEntities as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockEntities,
      );
      (storeToolCall as ReturnType<typeof vi.fn>).mockReturnValue("tool-123");

      await ingestWithToolTracking(
        mockSession,
        "session-1",
        "assistant",
        "Message",
        "tool",
      );

      expect(storeToolCall).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        "tool",
        {},
        "success",
        undefined,
      );
    });
  });

  describe("edge cases and error handling", () => {
    describe("ingestEnrichedMessage", () => {
      it("should throw error when embedding generation fails", async () => {
        mockEmbeddingsClient.generateEmbedding.mockRejectedValue(
          new Error("Network error"),
        );

        await expect(
          ingestEnrichedMessage(mockSession, "session-1", "user", "text"),
        ).rejects.toThrow();
      });

      it("should throw error when database transaction fails", async () => {
        const mockEmbedding = new Array(EMBEDDING_DIMENSION)
          .fill(0)
          .map((_, i) => i * 0.001);
        mockEmbeddingsClient.generateEmbedding.mockResolvedValue(mockEmbedding);

        (
          mockSession.executeWrite as ReturnType<typeof vi.fn>
        ).mockRejectedValue(new Error("Transaction failed"));

        await expect(
          ingestEnrichedMessage(mockSession, "session-1", "user", "text"),
        ).rejects.toThrow("Transaction failed");
      });

      it("should handle empty entity array", async () => {
        const mockEmbedding = new Array(EMBEDDING_DIMENSION)
          .fill(0)
          .map((_, i) => i * 0.001);
        mockEmbeddingsClient.generateEmbedding.mockResolvedValue(mockEmbedding);
        (extractAndStoreEntities as ReturnType<typeof vi.fn>).mockResolvedValue(
          [],
        );

        const messageId = await ingestEnrichedMessage(
          mockSession,
          "session-1",
          "user",
          "This is a longer message that should trigger extraction",
        );

        expect(messageId).toBeDefined();
        expect(extractAndStoreFacts).not.toHaveBeenCalled();
      });

      it("should handle entity extraction failure gracefully", async () => {
        const mockEmbedding = new Array(EMBEDDING_DIMENSION)
          .fill(0)
          .map((_, i) => i * 0.001);
        mockEmbeddingsClient.generateEmbedding.mockResolvedValue(mockEmbedding);
        (extractAndStoreEntities as ReturnType<typeof vi.fn>).mockRejectedValue(
          new Error("Entity extraction failed"),
        );

        await expect(
          ingestEnrichedMessage(
            mockSession,
            "session-1",
            "user",
            "This is a longer message that should trigger extraction",
          ),
        ).rejects.toThrow();
      });
    });

    describe("ingestWithToolTracking", () => {
      it("should handle tool call storage failure", async () => {
        const mockEmbedding = new Array(EMBEDDING_DIMENSION)
          .fill(0)
          .map((_, i) => i * 0.001);
        mockEmbeddingsClient.generateEmbedding.mockResolvedValue(mockEmbedding);
        (extractAndStoreEntities as ReturnType<typeof vi.fn>).mockResolvedValue(
          [],
        );

        (
          mockSession.executeWrite as ReturnType<typeof vi.fn>
        ).mockImplementation((callback) => {
          const tx = callback(mockTx);
          if (typeof tx === "object" && "then" in tx) {
            return tx.then(() => {
              throw new Error("Tool storage failed");
            });
          }
          throw new Error("Tool storage failed");
        });

        await expect(
          ingestWithToolTracking(
            mockSession,
            "session-1",
            "assistant",
            "Message",
            "tool",
          ),
        ).rejects.toThrow();
      });

      it("should handle null tool args", async () => {
        const mockEmbedding = new Array(EMBEDDING_DIMENSION)
          .fill(0)
          .map((_, i) => i * 0.001);
        mockEmbeddingsClient.generateEmbedding.mockResolvedValue(mockEmbedding);
        (extractAndStoreEntities as ReturnType<typeof vi.fn>).mockResolvedValue(
          [],
        );
        (storeToolCall as ReturnType<typeof vi.fn>).mockReturnValue("tool-123");

        const [messageId, _toolCallId] = await ingestWithToolTracking(
          mockSession,
          "session-1",
          "assistant",
          "Message",
          "tool",
          null as unknown as Record<string, unknown>,
        );

        expect(messageId).toBeDefined();
        expect(storeToolCall).toHaveBeenCalledWith(
          mockTx,
          messageId,
          "tool",
          {},
          "success",
          undefined,
        );
      });
    });
  });
});
