import type { ManagedTransaction } from "neo4j-driver";
import neo4j from "neo4j-driver";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLLMClient } from "../clients/llm.js";
import {
  extractAndStoreEntities,
  getEntitiesForMessage,
  getEntity,
  getRelatedEntities,
  createEntityId,
  type Entity,
} from "./entities.js";

vi.mock("../clients/llm.js", () => ({
  getLLMClient: vi.fn(),
}));

describe("entities", () => {
  let mockTx: ManagedTransaction;
  let mockLLMClient: { extractEntities: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    mockLLMClient = {
      extractEntities: vi.fn(),
    };

    (getLLMClient as ReturnType<typeof vi.fn>).mockReturnValue(mockLLMClient);

    mockTx = {
      run: vi.fn(),
    } as unknown as ManagedTransaction;
  });

  describe("createEntityId", () => {
    it("should create entity ID with type and name", () => {
      const result = createEntityId("PERSON", "John Doe");
      expect(result).toBe("person:john doe");
    });

    it("should handle whitespace", () => {
      const result = createEntityId("ORG", "  Acme Corp  ");
      expect(result).toBe("org:acme corp");
    });

    it("should lowercase the name", () => {
      const result = createEntityId("TECH", "TypeScript");
      expect(result).toBe("tech:typescript");
    });
  });

  describe("extractAndStoreEntities", () => {
    it("should extract entities and store them", async () => {
      const mockEntities = [
        { type: "PERSON", name: "John Doe" },
        { type: "ORG", name: "Acme Corp" },
      ];

      mockLLMClient.extractEntities.mockResolvedValue(mockEntities);

      const result = await extractAndStoreEntities(
        mockTx,
        "msg-123",
        "John Doe works at Acme Corp",
      );

      expect(mockLLMClient.extractEntities).toHaveBeenCalledWith(
        "John Doe works at Acme Corp",
      );
      expect(mockTx.run).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockEntities);
    });

    it("should skip entities without names", async () => {
      const mockEntities = [
        { type: "PERSON", name: "John Doe" },
        { type: "ORG", name: "" },
      ];

      mockLLMClient.extractEntities.mockResolvedValue(mockEntities);

      await extractAndStoreEntities(mockTx, "msg-123", "text");

      expect(mockTx.run).toHaveBeenCalledTimes(1);
    });

    it("should use OTHER as default type", async () => {
      const mockEntities = [{ type: "", name: "Something" }];

      mockLLMClient.extractEntities.mockResolvedValue(mockEntities);

      await extractAndStoreEntities(mockTx, "msg-123", "text");

      const callArgs = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].type).toBe("OTHER");
    });

    it("should create MENTIONS relationship", async () => {
      const mockEntities = [{ type: "PERSON", name: "John" }];

      mockLLMClient.extractEntities.mockResolvedValue(mockEntities);

      await extractAndStoreEntities(mockTx, "msg-123", "text");

      const callArgs = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[0]).toContain("MENTIONS");
      expect(callArgs[1].message_id).toBe("msg-123");
    });
  });

  describe("getEntity", () => {
    it("should return entity when found", () => {
      const mockRecord = {
        get: vi.fn((key: string) => {
          const values: Record<string, string> = {
            type: "PERSON",
            name: "John Doe",
            id: "person:john doe",
          };
          return values[key];
        }),
      };

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: [mockRecord],
      });

      const result = getEntity(mockTx, "person:john doe");

      expect(result).toEqual({
        type: "PERSON",
        name: "John Doe",
        id: "person:john doe",
      });
    });

    it("should return null when not found", () => {
      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: [],
      });

      const result = getEntity(mockTx, "nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("getEntitiesForMessage", () => {
    it("should return all entities for a message", () => {
      const mockRecords = [
        {
          get: vi.fn((key: string) => {
            const values: Record<string, string> = {
              type: "PERSON",
              name: "John",
              id: "person:john",
            };
            return values[key];
          }),
        },
        {
          get: vi.fn((key: string) => {
            const values: Record<string, string> = {
              type: "ORG",
              name: "Acme",
              id: "org:acme",
            };
            return values[key];
          }),
        },
      ];

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: mockRecords,
      });

      const result = getEntitiesForMessage(mockTx, "msg-123");

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("person:john");
      expect(result[1].id).toBe("org:acme");
    });

    it("should return empty array when no entities", () => {
      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: [],
      });

      const result = getEntitiesForMessage(mockTx, "msg-123");

      expect(result).toEqual([]);
    });
  });

  describe("getRelatedEntities", () => {
    it("should return related entities with strength", () => {
      const mockRecords = [
        {
          get: vi.fn((key: string) => {
            const values: Record<
              string,
              string | ReturnType<typeof neo4j.int>
            > = {
              type: "ORG",
              name: "Acme",
              id: "org:acme",
              strength: neo4j.int(5),
            };
            return values[key];
          }),
        },
      ];

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: mockRecords,
      });

      const result = getRelatedEntities(mockTx, "person:john");

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("org:acme");
      expect(result[0].strength).toBe(5);
    });

    it("should return empty array when no related entities", () => {
      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: [],
      });

      const result = getRelatedEntities(mockTx, "person:john");

      expect(result).toEqual([]);
    });
  });

  describe("edge cases and error handling", () => {
    describe("extractAndStoreEntities", () => {
      it("should handle empty entities array", async () => {
        mockLLMClient.extractEntities.mockResolvedValue([]);

        const result = await extractAndStoreEntities(mockTx, "msg-123", "text");

        expect(result).toEqual([]);
        expect(mockTx.run).not.toHaveBeenCalled();
      });

      it("should handle null entities array", async () => {
        mockLLMClient.extractEntities.mockResolvedValue(
          null as unknown as Entity[],
        );

        await expect(
          extractAndStoreEntities(mockTx, "msg-123", "text"),
        ).rejects.toThrow();
      });

      it("should handle LLM extraction failure", async () => {
        mockLLMClient.extractEntities.mockRejectedValue(
          new Error("LLM service unavailable"),
        );

        await expect(
          extractAndStoreEntities(mockTx, "msg-123", "text"),
        ).rejects.toThrow("LLM service unavailable");
      });

      it("should handle database transaction failure", async () => {
        const mockEntities = [{ type: "PERSON", name: "John" }];
        mockLLMClient.extractEntities.mockResolvedValue(mockEntities);
        (mockTx.run as ReturnType<typeof vi.fn>).mockImplementation(() => {
          throw new Error("Database error");
        });

        await expect(
          extractAndStoreEntities(mockTx, "msg-123", "text"),
        ).rejects.toThrow("Database error");
      });

      it("should handle entities with null/undefined properties", async () => {
        const mockEntities = [
          { type: "PERSON", name: "John" },
          { type: null as unknown as string, name: "Jane" },
          { type: "ORG", name: null as unknown as string },
          {
            type: undefined as unknown as string,
            name: undefined as unknown as string,
          },
        ];

        mockLLMClient.extractEntities.mockResolvedValue(
          mockEntities as Entity[],
        );

        await extractAndStoreEntities(mockTx, "msg-123", "text");

        expect(mockTx.run).toHaveBeenCalledTimes(2);
      });
    });

    describe("getEntity", () => {
      it("should handle empty canonicalId", () => {
        (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
          records: [],
        });

        const result = getEntity(mockTx, "");

        expect(result).toBeNull();
      });

      it("should handle database query failure", () => {
        (mockTx.run as ReturnType<typeof vi.fn>).mockImplementation(() => {
          throw new Error("Query failed");
        });

        expect(() => getEntity(mockTx, "entity:1")).toThrow("Query failed");
      });

      it("should handle record with missing properties", () => {
        const mockRecord = {
          get: vi.fn((key: string) => {
            if (key === "type") return "PERSON";
            if (key === "name") return null;
            if (key === "id") return "person:john";
            return null;
          }),
        };

        (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
          records: [mockRecord],
        });

        const result = getEntity(mockTx, "person:john");

        expect(result).toBeDefined();
        expect(result?.name).toBeNull();
      });
    });

    describe("getEntitiesForMessage", () => {
      it("should handle empty messageId", () => {
        (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
          records: [],
        });

        const result = getEntitiesForMessage(mockTx, "");

        expect(result).toEqual([]);
      });

      it("should handle database query failure", () => {
        (mockTx.run as ReturnType<typeof vi.fn>).mockImplementation(() => {
          throw new Error("Query failed");
        });

        expect(() => getEntitiesForMessage(mockTx, "msg-123")).toThrow(
          "Query failed",
        );
      });
    });

    describe("getRelatedEntities", () => {
      it("should handle empty canonicalId", () => {
        (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
          records: [],
        });

        const result = getRelatedEntities(mockTx, "");

        expect(result).toEqual([]);
      });

      it("should handle database query failure", () => {
        (mockTx.run as ReturnType<typeof vi.fn>).mockImplementation(() => {
          throw new Error("Query failed");
        });

        expect(() => getRelatedEntities(mockTx, "entity:1")).toThrow(
          "Query failed",
        );
      });

      it("should handle records with missing strength", () => {
        const mockRecord = {
          get: vi.fn((key: string) => {
            const values: Record<string, string | null> = {
              type: "ORG",
              name: "Acme",
              id: "org:acme",
              strength: null,
            };
            return values[key];
          }),
        };

        (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
          records: [mockRecord],
        });

        expect(() => getRelatedEntities(mockTx, "person:john")).toThrow();
      });
    });
  });
});
