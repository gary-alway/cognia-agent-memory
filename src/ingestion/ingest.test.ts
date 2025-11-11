import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session, ManagedTransaction } from "neo4j-driver";
import { ingestMessage } from "./ingest.js";
import { getEmbeddingsClient } from "../clients/embeddings.js";

vi.mock("../clients/embeddings.js", () => ({
  getEmbeddingsClient: vi.fn(),
}));

describe("ingest", () => {
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

  describe("ingestMessage", () => {
    it("should ingest a message with embedding", async () => {
      const mockEmbedding = [0.1, 0.2, 0.3];
      mockEmbeddingsClient.generateEmbedding.mockResolvedValue(mockEmbedding);

      const messageId = await ingestMessage(
        mockSession,
        "session-1",
        "user",
        "Hello world",
        0.8,
      );

      expect(messageId).toBeDefined();
      expect(mockEmbeddingsClient.generateEmbedding).toHaveBeenCalledWith(
        "Hello world",
      );
      expect(mockSession.executeWrite).toHaveBeenCalledTimes(1);
      expect(mockTx.run).toHaveBeenCalledTimes(1);

      const callArgs = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].session_id).toBe("session-1");
      expect(callArgs[1].role).toBe("user");
      expect(callArgs[1].text).toBe("Hello world");
      expect(callArgs[1].embedding).toEqual(mockEmbedding);
      expect(callArgs[1].importance).toBe(0.8);
    });

    it("should use default importance of 0.5", async () => {
      const mockEmbedding = [0.1, 0.2, 0.3];
      mockEmbeddingsClient.generateEmbedding.mockResolvedValue(mockEmbedding);

      await ingestMessage(mockSession, "session-1", "user", "Hello");

      const callArgs = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].importance).toBe(0.5);
    });

    it("should create session if it doesn't exist", async () => {
      const mockEmbedding = [0.1, 0.2, 0.3];
      mockEmbeddingsClient.generateEmbedding.mockResolvedValue(mockEmbedding);

      await ingestMessage(mockSession, "new-session", "user", "Hello");

      const callArgs = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[0]).toContain("MERGE (s:Session");
      expect(callArgs[0]).toContain("ON CREATE SET s.startedAt");
    });

    it("should link message to session", async () => {
      const mockEmbedding = [0.1, 0.2, 0.3];
      mockEmbeddingsClient.generateEmbedding.mockResolvedValue(mockEmbedding);

      await ingestMessage(mockSession, "session-1", "user", "Hello");

      const callArgs = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[0]).toContain("MERGE (s)-[:HAS_MESSAGE]->(m)");
    });

    it("should throw error when embedding generation fails", async () => {
      mockEmbeddingsClient.generateEmbedding.mockRejectedValue(
        new Error("Network error"),
      );

      await expect(
        ingestMessage(mockSession, "session-1", "user", "Hello"),
      ).rejects.toThrow("Network error");
    });

    it("should throw error when database transaction fails", async () => {
      const mockEmbedding = [0.1, 0.2, 0.3];
      mockEmbeddingsClient.generateEmbedding.mockResolvedValue(mockEmbedding);

      (mockSession.executeWrite as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Transaction failed"),
      );

      await expect(
        ingestMessage(mockSession, "session-1", "user", "Hello"),
      ).rejects.toThrow("Transaction failed");
    });

    it("should handle null session", async () => {
      const mockEmbedding = [0.1, 0.2, 0.3];
      mockEmbeddingsClient.generateEmbedding.mockResolvedValue(mockEmbedding);

      await expect(
        ingestMessage(null as unknown as Session, "session-1", "user", "Hello"),
      ).rejects.toThrow();
    });
  });
});
