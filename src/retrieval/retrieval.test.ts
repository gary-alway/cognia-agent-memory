import type { ManagedTransaction, Session } from "neo4j-driver";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMBEDDING_DIMENSION } from "../core/config.js";
import { recallSimilar, retrieveSimilarMemories } from "./retrieval.js";

describe("retrieval", () => {
  let mockSession: Session;
  let mockTx: ManagedTransaction;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTx = {
      run: vi.fn(),
    } as unknown as ManagedTransaction;

    mockSession = {
      executeRead: vi.fn(async (callback) => await callback(mockTx)),
    } as unknown as Session;
  });

  describe("recallSimilar", () => {
    it("should retrieve similar messages by embedding", async () => {
      const mockEmbedding = new Array(EMBEDDING_DIMENSION)
        .fill(0)
        .map((_, i) => i * 0.001);
      const mockRecords = [
        {
          get: vi.fn((key: string) => {
            const values: Record<
              string,
              string | number | { toString(): string }
            > = {
              id: "msg-1",
              text: "Hello world",
              role: "user",
              ts: { toString: () => "2024-01-01T00:00:00Z" },
              importance: 0.8,
              score: 0.95,
            };
            return values[key];
          }),
        },
      ];

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue(
        Promise.resolve({ records: mockRecords }),
      );

      const result = await recallSimilar(mockTx, mockEmbedding, 5);

      expect(mockTx.run).toHaveBeenCalledWith(
        expect.stringContaining("db.index.vector.queryNodes"),
        expect.objectContaining({
          query_embedding: mockEmbedding,
          top_k: 5,
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("msg-1");
      expect(result[0].text).toBe("Hello world");
      expect(result[0].score).toBe(0.95);
    });

    it("should use default importance of 0.5 when missing", async () => {
      const mockEmbedding = new Array(EMBEDDING_DIMENSION)
        .fill(0)
        .map((_, i) => i * 0.001);
      const mockRecords = [
        {
          get: vi.fn((key: string) => {
            const values: Record<
              string,
              string | number | null | { toString(): string }
            > = {
              id: "msg-1",
              text: "Hello",
              role: "user",
              ts: { toString: () => "2024-01-01T00:00:00Z" },
              importance: null,
              score: 0.9,
            };
            return values[key];
          }),
        },
      ];

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue(
        Promise.resolve({ records: mockRecords }),
      );

      const result = await recallSimilar(mockTx, mockEmbedding);

      expect(result[0].importance).toBe(0.5);
    });

    it("should use default topK of 5", async () => {
      const mockEmbedding = new Array(EMBEDDING_DIMENSION)
        .fill(0)
        .map((_, i) => i * 0.001);

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue(
        Promise.resolve({ records: [] }),
      );

      await recallSimilar(mockTx, mockEmbedding);

      const callArgs = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].top_k).toBe(5);
    });

    it("should use custom topK", async () => {
      const mockEmbedding = new Array(EMBEDDING_DIMENSION)
        .fill(0)
        .map((_, i) => i * 0.001);

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue(
        Promise.resolve({ records: [] }),
      );

      await recallSimilar(mockTx, mockEmbedding, 10);

      const callArgs = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].top_k).toBe(10);
    });

    it("should return empty array when result is null", async () => {
      const mockEmbedding = new Array(EMBEDDING_DIMENSION)
        .fill(0)
        .map((_, i) => i * 0.001);

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const result = await recallSimilar(mockTx, mockEmbedding);

      expect(result).toEqual([]);
    });

    it("should return empty array when records is undefined", async () => {
      const mockEmbedding = new Array(EMBEDDING_DIMENSION)
        .fill(0)
        .map((_, i) => i * 0.001);

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue(
        Promise.resolve({ records: undefined }),
      );

      const result = await recallSimilar(mockTx, mockEmbedding);

      expect(result).toEqual([]);
    });

    it("should return empty array when records is not an array", async () => {
      const mockEmbedding = new Array(EMBEDDING_DIMENSION)
        .fill(0)
        .map((_, i) => i * 0.001);

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue(
        Promise.resolve({ records: "not-an-array" }),
      );

      const result = await recallSimilar(mockTx, mockEmbedding);

      expect(result).toEqual([]);
    });

    it("should return empty array when query throws error", async () => {
      const mockEmbedding = new Array(EMBEDDING_DIMENSION)
        .fill(0)
        .map((_, i) => i * 0.001);

      (mockTx.run as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error("Query failed");
      });

      const result = await recallSimilar(mockTx, mockEmbedding);

      expect(result).toEqual([]);
    });

    it("should filter by userId when provided", async () => {
      const mockEmbedding = new Array(EMBEDDING_DIMENSION)
        .fill(0)
        .map((_, i) => i * 0.001);
      const mockRecords = [
        {
          get: vi.fn((key: string) => {
            const values: Record<
              string,
              string | number | { toString(): string }
            > = {
              id: "msg-1",
              text: "Hello world",
              role: "user",
              ts: { toString: () => "2024-01-01T00:00:00Z" },
              importance: 0.8,
              score: 0.95,
            };
            return values[key];
          }),
        },
      ];

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue(
        Promise.resolve({ records: mockRecords }),
      );

      const result = await recallSimilar(mockTx, mockEmbedding, 5, "user-1");

      expect(mockTx.run).toHaveBeenCalledWith(
        expect.stringContaining("db.index.vector.queryNodes"),
        expect.objectContaining({
          query_embedding: mockEmbedding,
          top_k: 5,
          user_id: "user-1",
        }),
      );
      expect(result).toHaveLength(1);
    });
  });

  describe("retrieveSimilarMemories", () => {
    it("should execute recallSimilar in a read transaction", async () => {
      const mockEmbedding = new Array(EMBEDDING_DIMENSION)
        .fill(0)
        .map((_, i) => i * 0.001);

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: [],
      });

      await retrieveSimilarMemories(mockSession, mockEmbedding, 5);

      expect(mockSession.executeRead).toHaveBeenCalledTimes(1);
      expect(mockTx.run).toHaveBeenCalled();
    });

    it("should use default topK of 5", async () => {
      const mockEmbedding = new Array(EMBEDDING_DIMENSION)
        .fill(0)
        .map((_, i) => i * 0.001);

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: [],
      });

      await retrieveSimilarMemories(mockSession, mockEmbedding);

      const callArgs = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].top_k).toBe(5);
    });

    it("should pass userId to recallSimilar when provided", async () => {
      const mockEmbedding = new Array(EMBEDDING_DIMENSION)
        .fill(0)
        .map((_, i) => i * 0.001);

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: [],
      });

      await retrieveSimilarMemories(mockSession, mockEmbedding, 5, "user-1");

      const callArgs = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].user_id).toBe("user-1");
    });

    it("should handle session read transaction failure", async () => {
      const mockEmbedding = new Array(EMBEDDING_DIMENSION)
        .fill(0)
        .map((_, i) => i * 0.001);

      (mockSession.executeRead as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Session error"),
      );

      await expect(
        retrieveSimilarMemories(mockSession, mockEmbedding),
      ).rejects.toThrow("Session error");
    });
  });

  describe("edge cases and error handling", () => {
    describe("recallSimilar", () => {
      it("should handle empty embedding array", async () => {
        await expect(recallSimilar(mockTx, [], 5)).rejects.toThrow();
      });

      it("should handle wrong embedding dimension", async () => {
        const wrongEmbedding = [0.1, 0.2, 0.3];
        await expect(
          recallSimilar(mockTx, wrongEmbedding, 5),
        ).rejects.toThrow();
      });

      it("should handle invalid topK values", async () => {
        const mockEmbedding = new Array(EMBEDDING_DIMENSION)
          .fill(0)
          .map((_, i) => i * 0.001);

        await expect(recallSimilar(mockTx, mockEmbedding, 0)).rejects.toThrow();
        await expect(
          recallSimilar(mockTx, mockEmbedding, -1),
        ).rejects.toThrow();
      });

      it("should handle records with missing fields", async () => {
        const mockEmbedding = new Array(EMBEDDING_DIMENSION)
          .fill(0)
          .map((_, i) => i * 0.001);
        const mockRecords = [
          {
            get: vi.fn((key: string) => {
              const values: Record<
                string,
                string | number | null | { toString(): string }
              > = {
                id: "msg-1",
                text: null,
                role: "user",
                ts: { toString: () => "2024-01-01T00:00:00Z" },
                importance: null,
                score: 0.95,
              };
              return values[key];
            }),
          },
        ];

        (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue(
          Promise.resolve({ records: mockRecords }),
        );

        const result = await recallSimilar(mockTx, mockEmbedding);

        expect(result).toHaveLength(1);
        expect(result[0].text).toBeNull();
        expect(result[0].importance).toBe(0.5);
      });
    });

    describe("retrieveSimilarMemories", () => {
      it("should handle empty embedding array", async () => {
        await expect(
          retrieveSimilarMemories(mockSession, []),
        ).rejects.toThrow();
      });

      it("should handle wrong embedding dimension", async () => {
        const wrongEmbedding = [0.1, 0.2, 0.3];
        await expect(
          retrieveSimilarMemories(mockSession, wrongEmbedding),
        ).rejects.toThrow();
      });
    });
  });
});
