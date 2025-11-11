import type { ManagedTransaction } from "neo4j-driver";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMBEDDING_DIMENSION } from "../core/config.js";
import { searchFacts } from "../memory/facts.js";
import { getUserPreferences } from "../memory/preferences.js";
import {
  calculateRecencyScore,
  hybridRetrieval,
  patternExpansionRetrieval,
  rerankResults,
  retrieveWithExpansionAndRerank,
} from "./advanced_retrieval.js";
import { recallSimilar } from "./retrieval.js";

vi.mock("./retrieval.js", () => ({
  recallSimilar: vi.fn(),
}));

vi.mock("../memory/facts.js", () => ({
  searchFacts: vi.fn(),
}));

vi.mock("../memory/preferences.js", () => ({
  getUserPreferences: vi.fn(),
}));

describe("advanced_retrieval", () => {
  let mockTx: ManagedTransaction;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTx = {
      run: vi.fn(),
    } as unknown as ManagedTransaction;
  });

  describe("calculateRecencyScore", () => {
    it("should calculate recency score for recent timestamp", () => {
      const recent = new Date();
      recent.setHours(recent.getHours() - 1);
      const score = calculateRecencyScore(recent.toISOString());
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it("should return lower score for older timestamp", () => {
      const old = new Date();
      old.setHours(old.getHours() - 24);
      const oldScore = calculateRecencyScore(old.toISOString());

      const recent = new Date();
      recent.setHours(recent.getHours() - 1);
      const recentScore = calculateRecencyScore(recent.toISOString());

      expect(recentScore).toBeGreaterThan(oldScore);
    });

    it("should return 0 for invalid timestamp", () => {
      const score = calculateRecencyScore("invalid");
      expect(score).toBe(0);
    });
  });

  describe("patternExpansionRetrieval", () => {
    it("should retrieve messages with entities", () => {
      const mockRecords = [
        {
          get: vi.fn((key: string) => {
            const values: Record<string, unknown> = {
              messages: [
                {
                  id: "msg-1",
                  text: "Hello",
                  role: "user",
                  ts: "2024-01-01",
                  importance: 0.8,
                },
              ],
              entities: [{ type: "PERSON", name: "John" }],
              facts: [],
              tools: [],
            };
            return values[key];
          }),
        },
      ];

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: mockRecords,
      });

      const result = patternExpansionRetrieval(
        mockTx,
        ["msg-1"],
        true,
        false,
        false,
      );

      expect(result.messages).toHaveLength(1);
      expect(result.expanded?.entities).toHaveLength(1);
    });

    it("should include facts when requested", () => {
      const mockRecords = [
        {
          get: vi.fn((key: string) => {
            const values: Record<string, unknown> = {
              messages: [
                {
                  id: "msg-1",
                  text: "Hello",
                  role: "user",
                  ts: "2024-01-01",
                  importance: 0.5,
                },
              ],
              entities: [],
              facts: [{ id: "fact-1", text: "Fact", confidence: 0.8 }],
              tools: [],
            };
            return values[key];
          }),
        },
      ];

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: mockRecords,
      });

      const result = patternExpansionRetrieval(
        mockTx,
        ["msg-1"],
        false,
        true,
        false,
      );

      expect(result.expanded?.facts).toHaveLength(1);
    });

    it("should include tools when requested", () => {
      const mockRecords = [
        {
          get: vi.fn((key: string) => {
            const values: Record<string, unknown> = {
              messages: [
                {
                  id: "msg-1",
                  text: "Hello",
                  role: "user",
                  ts: "2024-01-01",
                  importance: 0.5,
                },
              ],
              entities: [],
              facts: [],
              tools: [{ id: "tool-1", name: "api", status: "success" }],
            };
            return values[key];
          }),
        },
      ];

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: mockRecords,
      });

      const result = patternExpansionRetrieval(
        mockTx,
        ["msg-1"],
        false,
        false,
        true,
      );

      expect(result.expanded?.tools).toHaveLength(1);
    });

    it("should return empty messages when no records", () => {
      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: [],
      });

      const result = patternExpansionRetrieval(mockTx, ["msg-1"]);

      expect(result.messages).toEqual([]);
    });

    it("should return empty messages when result is null", () => {
      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const result = patternExpansionRetrieval(mockTx, ["msg-1"]);

      expect(result.messages).toEqual([]);
    });

    it("should return empty messages when records is undefined", () => {
      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: undefined,
      });

      const result = patternExpansionRetrieval(mockTx, ["msg-1"]);

      expect(result.messages).toEqual([]);
    });
  });

  describe("hybridRetrieval", () => {
    it("should combine message and fact retrieval", async () => {
      const mockMessages = [
        {
          id: "msg-1",
          text: "Hello",
          role: "user",
          ts: "2024-01-01",
          importance: 0.5,
          score: 0.9,
        },
      ];
      const mockFacts = [
        { id: "fact-1", text: "Fact", confidence: 0.8, score: 0.85 },
      ];

      (recallSimilar as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockMessages,
      );
      (searchFacts as ReturnType<typeof vi.fn>).mockResolvedValue(mockFacts);

      const queryEmbedding = new Array(EMBEDDING_DIMENSION)
        .fill(0)
        .map((_, i) => i * 0.001);
      const result = await hybridRetrieval(mockTx, queryEmbedding, 10, true);

      expect(result.messages).toHaveLength(1);
      expect(result.facts).toHaveLength(1);
      expect(recallSimilar).toHaveBeenCalled();
      expect(searchFacts).toHaveBeenCalled();
    });

    it("should pass userId to recallSimilar and searchFacts when provided", async () => {
      const mockMessages = [
        {
          id: "msg-1",
          text: "Hello",
          role: "user",
          ts: "2024-01-01",
          importance: 0.5,
          score: 0.9,
        },
      ];
      const mockFacts = [
        { id: "fact-1", text: "Fact", confidence: 0.8, score: 0.85 },
      ];

      (recallSimilar as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockMessages,
      );
      (searchFacts as ReturnType<typeof vi.fn>).mockResolvedValue(mockFacts);

      const queryEmbedding = new Array(EMBEDDING_DIMENSION)
        .fill(0)
        .map((_, i) => i * 0.001);
      const result = await hybridRetrieval(
        mockTx,
        queryEmbedding,
        10,
        true,
        "user-1",
      );

      expect(recallSimilar).toHaveBeenCalledWith(
        mockTx,
        queryEmbedding,
        10,
        "user-1",
      );
      expect(searchFacts).toHaveBeenCalledWith(
        mockTx,
        queryEmbedding,
        expect.any(Number),
        "user-1",
      );
      expect(result.messages).toHaveLength(1);
      expect(result.facts).toHaveLength(1);
    });

    it("should skip facts when includeFacts is false", async () => {
      const mockMessages = [
        {
          id: "msg-1",
          text: "Hello",
          role: "user",
          ts: "2024-01-01",
          importance: 0.5,
          score: 0.9,
        },
      ];

      (recallSimilar as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockMessages,
      );

      const result = await hybridRetrieval(mockTx, [0.1, 0.2, 0.3], 10, false);

      expect(result.messages).toHaveLength(1);
      expect(result.facts).toBeUndefined();
      expect(searchFacts).not.toHaveBeenCalled();
    });

    it("should return empty messages when recallSimilar throws", async () => {
      (recallSimilar as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Query failed"),
      );
      (searchFacts as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const queryEmbedding = new Array(EMBEDDING_DIMENSION)
        .fill(0)
        .map((_, i) => i * 0.001);
      const result = await hybridRetrieval(mockTx, queryEmbedding, 10, true);

      expect(result.messages).toEqual([]);
      expect(result.facts).toEqual([]);
    });

    it("should return empty facts when searchFacts throws", async () => {
      const mockMessages = [
        {
          id: "msg-1",
          text: "Hello",
          role: "user",
          ts: "2024-01-01",
          importance: 0.5,
          score: 0.9,
        },
      ];

      (recallSimilar as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockMessages,
      );
      (searchFacts as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Search failed"),
      );

      const queryEmbedding = new Array(EMBEDDING_DIMENSION)
        .fill(0)
        .map((_, i) => i * 0.001);
      const result = await hybridRetrieval(mockTx, queryEmbedding, 10, true);

      expect(result.messages).toHaveLength(1);
      expect(result.facts).toEqual([]);
    });
  });

  describe("rerankResults", () => {
    it("should rerank messages by final score", () => {
      const results = {
        messages: [
          {
            id: "msg-1",
            text: "Old",
            role: "user",
            ts: "2020-01-01",
            importance: 0.5,
            score: 0.9,
          },
          {
            id: "msg-2",
            text: "New",
            role: "user",
            ts: new Date().toISOString(),
            importance: 0.8,
            score: 0.7,
          },
        ],
      };

      const reranked = rerankResults(results);

      expect(reranked.messages[0].final_score).toBeGreaterThan(
        reranked.messages[1].final_score || 0,
      );
      expect(reranked.messages[0].id).toBe("msg-2");
    });

    it("should apply user preference boost", () => {
      const results = {
        messages: [
          {
            id: "msg-1",
            text: "formal response",
            role: "user",
            ts: new Date().toISOString(),
            importance: 0.5,
            score: 0.5,
          },
        ],
      };

      const userPreferences = [{ key: "tone", value: "formal" }];
      const reranked = rerankResults(results, userPreferences);

      expect(reranked.messages[0].final_score).toBeGreaterThan(0.5);
    });

    it("should rerank facts", () => {
      const results = {
        messages: [],
        facts: [
          { id: "fact-1", text: "Fact 1", confidence: 0.9, score: 0.8 },
          { id: "fact-2", text: "Fact 2", confidence: 0.7, score: 0.9 },
        ],
      };

      const reranked = rerankResults(results);

      expect(reranked.facts).toBeDefined();
      expect(reranked.facts![0].final_score).toBeGreaterThan(
        reranked.facts![1].final_score || 0,
      );
    });

    it("should handle null messages", () => {
      const results = {
        messages: null as unknown as never[],
      };

      const reranked = rerankResults(results);

      expect(reranked.messages).toEqual([]);
    });

    it("should handle undefined messages", () => {
      const results = {
        messages: undefined as unknown as never[],
      };

      const reranked = rerankResults(results);

      expect(reranked.messages).toEqual([]);
    });
  });

  describe("retrieveWithExpansionAndRerank", () => {
    it("should retrieve and rerank with expansion", async () => {
      const mockMessages = [
        {
          id: "msg-1",
          text: "Hello",
          role: "user",
          ts: new Date().toISOString(),
          importance: 0.5,
          score: 0.9,
        },
      ];
      const mockFacts = [
        { id: "fact-1", text: "Fact", confidence: 0.8, score: 0.85 },
      ];

      (recallSimilar as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockMessages,
      );
      (searchFacts as ReturnType<typeof vi.fn>).mockResolvedValue(mockFacts);
      (getUserPreferences as ReturnType<typeof vi.fn>).mockReturnValue([]);

      const mockRecords = [
        {
          get: vi.fn((key: string) => {
            const values: Record<string, unknown> = {
              messages: mockMessages,
              entities: [],
              facts: [],
              tools: [],
            };
            return values[key];
          }),
        },
      ];

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: mockRecords,
      });

      const result = await retrieveWithExpansionAndRerank(
        mockTx,
        new Array(EMBEDDING_DIMENSION).fill(0).map((_, i) => i * 0.001),
        "user-1",
        10,
        true,
      );

      expect(result.messages).toBeDefined();
      expect(result.messages[0].final_score).toBeDefined();
    });

    it("should skip expansion when expand is false", async () => {
      const mockMessages = [
        {
          id: "msg-1",
          text: "Hello",
          role: "user",
          ts: new Date().toISOString(),
          importance: 0.5,
          score: 0.9,
        },
      ];

      (recallSimilar as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockMessages,
      );
      (searchFacts as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (getUserPreferences as ReturnType<typeof vi.fn>).mockReturnValue([]);

      const result = await retrieveWithExpansionAndRerank(
        mockTx,
        new Array(EMBEDDING_DIMENSION).fill(0).map((_, i) => i * 0.001),
        undefined,
        10,
        false,
      );

      expect(result.expanded).toBeUndefined();
    });

    it("should return empty messages when hybridRetrieval returns null", async () => {
      (recallSimilar as ReturnType<typeof vi.fn>).mockReturnValue([]);
      (searchFacts as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await retrieveWithExpansionAndRerank(
        mockTx,
        new Array(EMBEDDING_DIMENSION).fill(0).map((_, i) => i * 0.001),
        undefined,
        10,
        true,
      );

      expect(result.messages).toEqual([]);
    });

    it("should handle getUserPreferences throwing error", async () => {
      const mockMessages = [
        {
          id: "msg-1",
          text: "Hello",
          role: "user",
          ts: new Date().toISOString(),
          importance: 0.5,
          score: 0.9,
        },
      ];

      (recallSimilar as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockMessages,
      );
      (searchFacts as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (getUserPreferences as ReturnType<typeof vi.fn>).mockImplementation(
        () => {
          throw new Error("Preferences query failed");
        },
      );

      const result = await retrieveWithExpansionAndRerank(
        mockTx,
        new Array(EMBEDDING_DIMENSION).fill(0).map((_, i) => i * 0.001),
        "user-1",
        10,
        true,
      );

      expect(result.messages).toBeDefined();
    });

    it("should handle patternExpansionRetrieval throwing error", async () => {
      const mockMessages = [
        {
          id: "msg-1",
          text: "Hello",
          role: "user",
          ts: new Date().toISOString(),
          importance: 0.5,
          score: 0.9,
        },
      ];

      (recallSimilar as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockMessages,
      );
      (searchFacts as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (getUserPreferences as ReturnType<typeof vi.fn>).mockReturnValue([]);

      (mockTx.run as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error("Pattern expansion failed");
      });

      const result = await retrieveWithExpansionAndRerank(
        mockTx,
        new Array(EMBEDDING_DIMENSION).fill(0).map((_, i) => i * 0.001),
        "user-1",
        10,
        true,
      );

      expect(result.messages).toBeDefined();
    });

    it("should return empty messages when error occurs", async () => {
      (recallSimilar as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error("Retrieval failed");
      });

      const result = await retrieveWithExpansionAndRerank(
        mockTx,
        new Array(EMBEDDING_DIMENSION).fill(0).map((_, i) => i * 0.001),
        undefined,
        10,
        true,
      );

      expect(result.messages).toEqual([]);
    });
  });

  describe("edge cases and error handling", () => {
    describe("retrieveWithExpansionAndRerank", () => {
      it("should handle empty embedding array", async () => {
        await expect(
          retrieveWithExpansionAndRerank(mockTx, [], undefined, 10, true),
        ).rejects.toThrow();
      });

      it("should handle wrong embedding dimension", async () => {
        const wrongEmbedding = [0.1, 0.2, 0.3];
        await expect(
          retrieveWithExpansionAndRerank(
            mockTx,
            wrongEmbedding,
            undefined,
            10,
            true,
          ),
        ).rejects.toThrow();
      });

      it("should handle invalid topK values", async () => {
        const mockEmbedding = new Array(EMBEDDING_DIMENSION)
          .fill(0)
          .map((_, i) => i * 0.001);

        await expect(
          retrieveWithExpansionAndRerank(
            mockTx,
            mockEmbedding,
            undefined,
            0,
            true,
          ),
        ).rejects.toThrow();
        await expect(
          retrieveWithExpansionAndRerank(
            mockTx,
            mockEmbedding,
            undefined,
            -1,
            true,
          ),
        ).rejects.toThrow();
        await expect(
          retrieveWithExpansionAndRerank(
            mockTx,
            mockEmbedding,
            undefined,
            101,
            true,
          ),
        ).rejects.toThrow();
      });

      it("should handle empty seedIds array in patternExpansionRetrieval", () => {
        const result = patternExpansionRetrieval(mockTx, [], true, true, true);
        expect(result.messages).toEqual([]);
      });

      it("should filter by userId when provided in patternExpansionRetrieval", () => {
        const mockRecords = [
          {
            get: vi.fn((key: string) => {
              const values: Record<string, unknown> = {
                messages: [
                  {
                    id: "msg-1",
                    text: "Hello",
                    role: "user",
                    ts: "2024-01-01",
                    importance: 0.8,
                  },
                ],
                entities: [],
                facts: [],
                tools: [],
              };
              return values[key];
            }),
          },
        ];

        (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
          records: mockRecords,
        });

        const result = patternExpansionRetrieval(
          mockTx,
          ["msg-1"],
          true,
          true,
          true,
          "user-1",
        );

        expect(mockTx.run).toHaveBeenCalledWith(
          expect.stringContaining("User"),
          expect.objectContaining({
            seed_ids: ["msg-1"],
            user_id: "user-1",
          }),
        );
        expect(result.messages).toHaveLength(1);
      });

      it("should handle null seedIds in patternExpansionRetrieval", () => {
        (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
          records: [],
        });

        const result = patternExpansionRetrieval(
          mockTx,
          null as unknown as string[],
          true,
          true,
          true,
        );
        expect(result.messages).toEqual([]);
      });

      it("should handle database query failure in patternExpansionRetrieval", () => {
        (mockTx.run as ReturnType<typeof vi.fn>).mockImplementation(() => {
          throw new Error("Query failed");
        });

        expect(() =>
          patternExpansionRetrieval(mockTx, ["msg-1"], true, true, true),
        ).toThrow("Query failed");
      });

      it("should handle null/undefined messages in rerankResults", () => {
        const result = rerankResults(
          { messages: null as unknown as [] },
          undefined,
        );
        expect(result.messages).toEqual([]);
      });

      it("should handle empty userPreferences array", () => {
        const mockResults: RetrievedResult = {
          messages: [
            {
              id: "msg-1",
              text: "test",
              role: "user",
              ts: new Date().toISOString(),
              importance: 0.5,
              score: 0.8,
            },
          ],
        };

        const result = rerankResults(mockResults, []);
        expect(result.messages).toHaveLength(1);
      });

      it("should handle null userPreferences", () => {
        const mockResults: RetrievedResult = {
          messages: [
            {
              id: "msg-1",
              text: "test",
              role: "user",
              ts: new Date().toISOString(),
              importance: 0.5,
              score: 0.8,
            },
          ],
        };

        const result = rerankResults(mockResults, null as unknown as []);
        expect(result.messages).toHaveLength(1);
      });

      it("should handle invalid timestamp in calculateRecencyScore", () => {
        const score = calculateRecencyScore("invalid-date");
        expect(score).toBe(0.0);
      });

      it("should handle empty timestamp in calculateRecencyScore", () => {
        const score = calculateRecencyScore("");
        expect(score).toBe(0.0);
      });
    });

    describe("hybridRetrieval", () => {
      it("should handle empty embedding array gracefully", async () => {
        (recallSimilar as ReturnType<typeof vi.fn>).mockReturnValue([]);
        (searchFacts as ReturnType<typeof vi.fn>).mockResolvedValue([]);

        const result = await hybridRetrieval(mockTx, [], 10, true);
        expect(result.messages).toEqual([]);
      });

      it("should handle wrong embedding dimension gracefully", async () => {
        (recallSimilar as ReturnType<typeof vi.fn>).mockReturnValue([]);
        (searchFacts as ReturnType<typeof vi.fn>).mockResolvedValue([]);

        const wrongEmbedding = [0.1, 0.2, 0.3];
        const result = await hybridRetrieval(mockTx, wrongEmbedding, 10, true);
        expect(result.messages).toEqual([]);
      });

      it("should handle recallSimilar failure gracefully", async () => {
        (recallSimilar as ReturnType<typeof vi.fn>).mockRejectedValue(
          new Error("Recall failed"),
        );

        const result = await hybridRetrieval(
          mockTx,
          new Array(EMBEDDING_DIMENSION).fill(0).map((_, i) => i * 0.001),
          10,
          true,
        );

        expect(result.messages).toEqual([]);
      });

      it("should handle searchFacts failure gracefully", async () => {
        (recallSimilar as ReturnType<typeof vi.fn>).mockReturnValue([]);
        (searchFacts as ReturnType<typeof vi.fn>).mockRejectedValue(
          new Error("Search failed"),
        );

        const result = await hybridRetrieval(
          mockTx,
          new Array(EMBEDDING_DIMENSION).fill(0).map((_, i) => i * 0.001),
          10,
          true,
        );

        expect(result.messages).toEqual([]);
        expect(result.facts).toEqual([]);
      });
    });
  });
});
