import type { ManagedTransaction } from "neo4j-driver";
import neo4j from "neo4j-driver";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEmbeddingsClient } from "../clients/embeddings.js";
import { getLLMClient } from "../clients/llm.js";
import { EMBEDDING_DIMENSION } from "../core/config.js";
import {
  extractAndStoreFacts,
  getFactsAboutEntity,
  searchFacts,
} from "./facts.js";

vi.mock("../clients/llm.js", () => ({
  getLLMClient: vi.fn(),
}));

vi.mock("../clients/embeddings.js", () => ({
  getEmbeddingsClient: vi.fn(),
}));

describe("facts", () => {
  let mockTx: ManagedTransaction;
  let mockLLMClient: { extractFacts: ReturnType<typeof vi.fn> };
  let mockEmbeddingsClient: { generateEmbedding: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    mockLLMClient = {
      extractFacts: vi.fn(),
    };

    mockEmbeddingsClient = {
      generateEmbedding: vi.fn(),
    };

    (getLLMClient as ReturnType<typeof vi.fn>).mockReturnValue(mockLLMClient);
    (getEmbeddingsClient as ReturnType<typeof vi.fn>).mockReturnValue(
      mockEmbeddingsClient,
    );

    mockTx = {
      run: vi.fn(),
    } as unknown as ManagedTransaction;
  });

  describe("extractAndStoreFacts", () => {
    it("should extract and store facts", async () => {
      const mockFacts = ["John works at Acme", "Acme is a tech company"];
      const mockEmbedding = new Array(EMBEDDING_DIMENSION)
        .fill(0)
        .map((_, i) => i * 0.001);

      mockLLMClient.extractFacts.mockResolvedValue(mockFacts);
      mockEmbeddingsClient.generateEmbedding.mockResolvedValue(mockEmbedding);

      const result = await extractAndStoreFacts(
        mockTx,
        "msg-123",
        "John works at Acme, a tech company",
        ["person:john", "org:acme"],
      );

      expect(mockLLMClient.extractFacts).toHaveBeenCalledWith(
        "John works at Acme, a tech company",
        ["person:john", "org:acme"],
      );
      expect(mockEmbeddingsClient.generateEmbedding).toHaveBeenCalledTimes(2);
      expect(mockTx.run).toHaveBeenCalled();
      expect(result).toHaveLength(2);
      expect(result[0].text).toBe("John works at Acme");
    });

    it("should skip empty facts", async () => {
      const mockFacts = ["Valid fact", "", "   "];
      const mockEmbedding = new Array(EMBEDDING_DIMENSION)
        .fill(0)
        .map((_, i) => i * 0.001);

      mockLLMClient.extractFacts.mockResolvedValue(mockFacts);
      mockEmbeddingsClient.generateEmbedding.mockResolvedValue(mockEmbedding);

      const result = await extractAndStoreFacts(mockTx, "msg-123", "text", [
        "entity:1",
      ]);

      expect(result).toHaveLength(1);
    });

    it("should link facts to entities", async () => {
      const mockFacts = ["John works at Acme"];
      const mockEmbedding = new Array(EMBEDDING_DIMENSION)
        .fill(0)
        .map((_, i) => i * 0.001);

      mockLLMClient.extractFacts.mockResolvedValue(mockFacts);
      mockEmbeddingsClient.generateEmbedding.mockResolvedValue(mockEmbedding);

      await extractAndStoreFacts(mockTx, "msg-123", "text", [
        "person:john",
        "org:acme",
      ]);

      const runCalls = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls;
      const entityLinkCalls = runCalls.filter((call) =>
        call[0].includes("ABOUT"),
      );
      expect(entityLinkCalls).toHaveLength(2);
    });
  });

  describe("getFactsAboutEntity", () => {
    it("should return facts about an entity", async () => {
      const mockRecords = [
        {
          get: vi.fn((key: string) => {
            const values: Record<string, string | number> = {
              id: "fact-1",
              text: "John works at Acme",
              confidence: 0.8,
              source: "extracted",
            };
            return values[key];
          }),
        },
      ];

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue(
        Promise.resolve({ records: mockRecords }),
      );

      const result = await getFactsAboutEntity(mockTx, "person:john");

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("fact-1");
      expect(result[0].text).toBe("John works at Acme");
      expect(result[0].confidence).toBe(0.8);
    });

    it("should use default limit of 10", async () => {
      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue(
        Promise.resolve({ records: [] }),
      );

      await getFactsAboutEntity(mockTx, "person:john");

      const callArgs = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].limit).toBe(10);
    });

    it("should use custom limit", async () => {
      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue(
        Promise.resolve({ records: [] }),
      );

      await getFactsAboutEntity(mockTx, "person:john", 5);

      const callArgs = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].limit).toBe(5);
    });
  });

  describe("searchFacts", () => {
    it("should search facts by embedding", async () => {
      const mockEmbedding = new Array(EMBEDDING_DIMENSION)
        .fill(0)
        .map((_, i) => i * 0.001);
      const mockRecords = [
        {
          get: vi.fn((key: string) => {
            const values: Record<
              string,
              string | number | ReturnType<typeof neo4j.int>
            > = {
              id: "fact-1",
              text: "John works at Acme",
              confidence: neo4j.int(8),
              source: "extracted",
              score: 0.95,
            };
            return values[key];
          }),
        },
      ];

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue(
        Promise.resolve({ records: mockRecords }),
      );

      const result = await searchFacts(mockTx, mockEmbedding, 5);

      expect(mockTx.run).toHaveBeenCalledWith(
        expect.stringContaining("db.index.vector.queryNodes"),
        expect.objectContaining({
          query_embedding: mockEmbedding,
          top_k: 5,
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("fact-1");
      expect(result[0].score).toBe(0.95);
    });

    it("should use default topK of 10", async () => {
      const mockEmbedding = new Array(EMBEDDING_DIMENSION)
        .fill(0)
        .map((_, i) => i * 0.001);

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue(
        Promise.resolve({ records: [] }),
      );

      await searchFacts(mockTx, mockEmbedding);

      const callArgs = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].top_k).toBe(10);
    });

    it("should return empty array when result is null", async () => {
      const mockEmbedding = new Array(EMBEDDING_DIMENSION)
        .fill(0)
        .map((_, i) => i * 0.001);

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const result = await searchFacts(mockTx, mockEmbedding);

      expect(result).toEqual([]);
    });

    it("should return empty array when records is undefined", async () => {
      const mockEmbedding = new Array(EMBEDDING_DIMENSION)
        .fill(0)
        .map((_, i) => i * 0.001);

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue(
        Promise.resolve({ records: undefined }),
      );

      const result = await searchFacts(mockTx, mockEmbedding);

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
              string | number | ReturnType<typeof neo4j.int>
            > = {
              id: "fact-1",
              text: "John works at Acme",
              confidence: neo4j.int(8),
              source: "extracted",
              score: 0.95,
            };
            return values[key];
          }),
        },
      ];

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue(
        Promise.resolve({ records: mockRecords }),
      );

      const result = await searchFacts(mockTx, mockEmbedding, 5, "user-1");

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

  describe("getFactsAboutEntity", () => {
    it("should return empty array when result is null", async () => {
      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const result = await getFactsAboutEntity(mockTx, "person:john");

      expect(result).toEqual([]);
    });

    it("should return empty array when records is undefined", async () => {
      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue(
        Promise.resolve({ records: undefined }),
      );

      const result = await getFactsAboutEntity(mockTx, "person:john");

      expect(result).toEqual([]);
    });
  });

  describe("edge cases and error handling", () => {
    describe("extractAndStoreFacts", () => {
      it("should handle empty facts array", async () => {
        mockLLMClient.extractFacts.mockResolvedValue([]);

        const result = await extractAndStoreFacts(mockTx, "msg-123", "text", [
          "entity:1",
        ]);

        expect(result).toEqual([]);
        expect(mockEmbeddingsClient.generateEmbedding).not.toHaveBeenCalled();
      });

      it("should handle null facts array", async () => {
        mockLLMClient.extractFacts.mockResolvedValue(
          null as unknown as string[],
        );

        await expect(
          extractAndStoreFacts(mockTx, "msg-123", "text", ["entity:1"]),
        ).rejects.toThrow();
      });

      it("should handle empty entityIds array", async () => {
        const mockFacts = ["John works at Acme"];
        const mockEmbedding = new Array(EMBEDDING_DIMENSION)
          .fill(0)
          .map((_, i) => i * 0.001);

        mockLLMClient.extractFacts.mockResolvedValue(mockFacts);
        mockEmbeddingsClient.generateEmbedding.mockResolvedValue(mockEmbedding);

        const result = await extractAndStoreFacts(
          mockTx,
          "msg-123",
          "text",
          [],
        );

        expect(result).toHaveLength(1);
        expect(mockTx.run).toHaveBeenCalled();
      });

      it("should handle LLM extraction failure", async () => {
        mockLLMClient.extractFacts.mockRejectedValue(
          new Error("LLM service unavailable"),
        );

        await expect(
          extractAndStoreFacts(mockTx, "msg-123", "text", ["entity:1"]),
        ).rejects.toThrow("LLM service unavailable");
      });

      it("should continue processing when individual fact embedding fails", async () => {
        const mockFacts = ["Fact 1", "Fact 2", "Fact 3"];
        const mockEmbedding = new Array(EMBEDDING_DIMENSION)
          .fill(0)
          .map((_, i) => i * 0.001);

        mockLLMClient.extractFacts.mockResolvedValue(mockFacts);
        mockEmbeddingsClient.generateEmbedding
          .mockResolvedValueOnce(mockEmbedding)
          .mockRejectedValueOnce(new Error("Embedding failed"))
          .mockResolvedValueOnce(mockEmbedding);

        const result = await extractAndStoreFacts(mockTx, "msg-123", "text", [
          "entity:1",
        ]);

        expect(result).toHaveLength(2);
        expect(mockEmbeddingsClient.generateEmbedding).toHaveBeenCalledTimes(3);
      });

      it("should handle database transaction failure gracefully", async () => {
        const mockFacts = ["John works at Acme"];
        const mockEmbedding = new Array(EMBEDDING_DIMENSION)
          .fill(0)
          .map((_, i) => i * 0.001);

        mockLLMClient.extractFacts.mockResolvedValue(mockFacts);
        mockEmbeddingsClient.generateEmbedding.mockResolvedValue(mockEmbedding);
        (mockTx.run as ReturnType<typeof vi.fn>).mockImplementation(() => {
          throw new Error("Database error");
        });

        const result = await extractAndStoreFacts(mockTx, "msg-123", "text", [
          "entity:1",
        ]);

        expect(result).toEqual([]);
      });
    });

    describe("getFactsAboutEntity", () => {
      it("should handle empty entityId", async () => {
        (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
          records: [],
        });

        await expect(getFactsAboutEntity(mockTx, "")).rejects.toThrow();
      });

      it("should handle database query failure", async () => {
        (mockTx.run as ReturnType<typeof vi.fn>).mockImplementation(() => {
          throw new Error("Query failed");
        });

        await expect(getFactsAboutEntity(mockTx, "entity:1")).rejects.toThrow(
          "Query failed",
        );
      });

      it("should handle invalid limit values", async () => {
        await expect(
          getFactsAboutEntity(mockTx, "entity:1", 0),
        ).rejects.toThrow();
        await expect(
          getFactsAboutEntity(mockTx, "entity:1", -1),
        ).rejects.toThrow();
        await expect(
          getFactsAboutEntity(mockTx, "entity:1", 101),
        ).rejects.toThrow();
      });
    });

    describe("searchFacts", () => {
      it("should handle empty embedding array", async () => {
        await expect(searchFacts(mockTx, [], 5)).rejects.toThrow();
      });

      it("should handle wrong embedding dimension", async () => {
        const wrongEmbedding = [0.1, 0.2, 0.3];
        await expect(searchFacts(mockTx, wrongEmbedding, 5)).rejects.toThrow();
      });

      it("should handle database query failure", async () => {
        const mockEmbedding = new Array(EMBEDDING_DIMENSION)
          .fill(0)
          .map((_, i) => i * 0.001);

        (mockTx.run as ReturnType<typeof vi.fn>).mockImplementation(() => {
          throw new Error("Vector query failed");
        });

        await expect(searchFacts(mockTx, mockEmbedding, 5)).rejects.toThrow(
          "Vector query failed",
        );
      });

      it("should handle invalid topK values", async () => {
        const mockEmbedding = new Array(EMBEDDING_DIMENSION)
          .fill(0)
          .map((_, i) => i * 0.001);

        await expect(searchFacts(mockTx, mockEmbedding, 0)).rejects.toThrow();
        await expect(searchFacts(mockTx, mockEmbedding, -1)).rejects.toThrow();
        await expect(searchFacts(mockTx, mockEmbedding, 101)).rejects.toThrow();
      });
    });
  });
});
