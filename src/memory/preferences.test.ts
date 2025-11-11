import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedTransaction } from "neo4j-driver";
import neo4j from "neo4j-driver";
import {
  associateSessionWithUser,
  createOrUpdatePreference,
  deletePreference,
  getPreference,
  getUserPreferences,
} from "./preferences.js";

describe("preferences", () => {
  let mockTx: ManagedTransaction;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTx = {
      run: vi.fn(),
    } as unknown as ManagedTransaction;
  });

  describe("createOrUpdatePreference", () => {
    it("should create or update a preference", () => {
      createOrUpdatePreference(mockTx, "user-1", "tone", "formal", 0.9);

      expect(mockTx.run).toHaveBeenCalledTimes(1);
      const callArgs = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].user_id).toBe("user-1");
      expect(callArgs[1].key).toBe("tone");
      expect(callArgs[1].value).toBe("formal");
      expect(callArgs[1].confidence).toBe(0.9);
    });

    it("should use default confidence of 1.0", () => {
      createOrUpdatePreference(mockTx, "user-1", "tone", "formal");

      const callArgs = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].confidence).toBe(1.0);
    });
  });

  describe("getUserPreferences", () => {
    it("should return all preferences for a user with neo4j.int confidence", async () => {
      const mockRecords = [
        {
          get: vi.fn((key: string) => {
            const values: Record<
              string,
              string | ReturnType<typeof neo4j.int>
            > = {
              key: "tone",
              value: "formal",
              confidence: neo4j.int(1),
            };
            return values[key];
          }),
        },
        {
          get: vi.fn((key: string) => {
            const values: Record<
              string,
              string | ReturnType<typeof neo4j.int>
            > = {
              key: "language",
              value: "en",
              confidence: neo4j.int(1),
            };
            return values[key];
          }),
        },
      ];

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: mockRecords,
      });

      const result = await getUserPreferences(mockTx, "user-1");

      expect(result).toHaveLength(2);
      expect(result[0].key).toBe("tone");
      expect(result[0].value).toBe("formal");
      expect(result[0].confidence).toBe(1);
      expect(result[1].key).toBe("language");
      expect(result[1].value).toBe("en");
      expect(result[1].confidence).toBe(1);
    });

    it("should return preferences with number confidence values", async () => {
      const mockRecords = [
        {
          get: vi.fn((key: string) => {
            const values: Record<string, string | number> = {
              key: "tone",
              value: "formal",
              confidence: 0.9,
            };
            return values[key];
          }),
        },
      ];

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: mockRecords,
      });

      const result = await getUserPreferences(mockTx, "user-1");

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe("tone");
      expect(result[0].value).toBe("formal");
      expect(result[0].confidence).toBe(0.9);
    });

    it("should handle null confidence and default to 1.0", async () => {
      const mockRecords = [
        {
          get: vi.fn((key: string) => {
            const values: Record<string, string | null> = {
              key: "tone",
              value: "formal",
              confidence: null,
            };
            return values[key];
          }),
        },
      ];

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: mockRecords,
      });

      const result = await getUserPreferences(mockTx, "user-1");

      expect(result).toHaveLength(1);
      expect(result[0].confidence).toBe(1.0);
    });

    it("should return empty array when no preferences", async () => {
      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: [],
      });

      const result = await getUserPreferences(mockTx, "user-1");

      expect(result).toEqual([]);
    });

    it("should return empty array when result is null", async () => {
      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const result = await getUserPreferences(mockTx, "user-1");

      expect(result).toEqual([]);
    });

    it("should return empty array when records is undefined", async () => {
      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: undefined,
      });

      const result = await getUserPreferences(mockTx, "user-1");

      expect(result).toEqual([]);
    });

    it("should return empty array when records is not an array", async () => {
      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: "not-an-array",
      });

      const result = await getUserPreferences(mockTx, "user-1");

      expect(result).toEqual([]);
    });

    it("should return empty array when result has no records property", async () => {
      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({});

      const result = await getUserPreferences(mockTx, "user-1");

      expect(result).toEqual([]);
    });
  });

  describe("getPreference", () => {
    it("should return a specific preference when found with neo4j.int confidence", () => {
      const mockRecord = {
        get: vi.fn((key: string) => {
          const values: Record<string, string | ReturnType<typeof neo4j.int>> =
            {
              value: "formal",
              confidence: neo4j.int(1),
            };
          return values[key];
        }),
      };

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: [mockRecord],
      });

      const result = getPreference(mockTx, "user-1", "tone");

      expect(result).toEqual({
        key: "tone",
        value: "formal",
        confidence: 1,
      });
    });

    it("should return a preference with number confidence value", () => {
      const mockRecord = {
        get: vi.fn((key: string) => {
          const values: Record<string, string | number> = {
            value: "formal",
            confidence: 0.8,
          };
          return values[key];
        }),
      };

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: [mockRecord],
      });

      const result = getPreference(mockTx, "user-1", "tone");

      expect(result).toEqual({
        key: "tone",
        value: "formal",
        confidence: 0.8,
      });
    });

    it("should handle null confidence and default to 1.0", () => {
      const mockRecord = {
        get: vi.fn((key: string) => {
          const values: Record<string, string | null> = {
            value: "formal",
            confidence: null,
          };
          return values[key];
        }),
      };

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: [mockRecord],
      });

      const result = getPreference(mockTx, "user-1", "tone");

      expect(result).toEqual({
        key: "tone",
        value: "formal",
        confidence: 1.0,
      });
    });

    it("should return null when preference not found", () => {
      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: [],
      });

      const result = getPreference(mockTx, "user-1", "tone");

      expect(result).toBeNull();
    });

    it("should return null when result is null", () => {
      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const result = getPreference(mockTx, "user-1", "tone");

      expect(result).toBeNull();
    });

    it("should return null when records is undefined", () => {
      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: undefined,
      });

      const result = getPreference(mockTx, "user-1", "tone");

      expect(result).toBeNull();
    });

    it("should return null when records is not an array", () => {
      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: "not-an-array",
      });

      const result = getPreference(mockTx, "user-1", "tone");

      expect(result).toBeNull();
    });

    it("should return null when result has no records property", () => {
      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({});

      const result = getPreference(mockTx, "user-1", "tone");

      expect(result).toBeNull();
    });
  });

  describe("deletePreference", () => {
    it("should delete a preference", () => {
      deletePreference(mockTx, "user-1", "tone");

      expect(mockTx.run).toHaveBeenCalledTimes(1);
      const callArgs = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].user_id).toBe("user-1");
      expect(callArgs[1].key).toBe("tone");
    });
  });

  describe("associateSessionWithUser", () => {
    it("should associate a session with a user", () => {
      associateSessionWithUser(mockTx, "session-1", "user-1");

      expect(mockTx.run).toHaveBeenCalledTimes(1);
      const callArgs = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].session_id).toBe("session-1");
      expect(callArgs[1].user_id).toBe("user-1");
    });
  });

  describe("edge cases and error handling", () => {
    describe("createOrUpdatePreference", () => {
      it("should handle empty userId", () => {
        createOrUpdatePreference(mockTx, "", "key", "value");
        expect(mockTx.run).toHaveBeenCalled();
      });

      it("should handle empty key", () => {
        createOrUpdatePreference(mockTx, "user-1", "", "value");
        expect(mockTx.run).toHaveBeenCalled();
      });

      it("should handle database transaction failure", () => {
        (mockTx.run as ReturnType<typeof vi.fn>).mockImplementation(() => {
          throw new Error("Transaction failed");
        });

        expect(() =>
          createOrUpdatePreference(mockTx, "user-1", "key", "value"),
        ).toThrow("Transaction failed");
      });

      it("should handle invalid confidence values", () => {
        createOrUpdatePreference(mockTx, "user-1", "key", "value", -1);
        expect(mockTx.run).toHaveBeenCalled();
        createOrUpdatePreference(mockTx, "user-1", "key", "value", 2);
        expect(mockTx.run).toHaveBeenCalled();
      });
    });

    describe("getUserPreferences", () => {
      it("should handle empty userId", async () => {
        (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
          records: [],
        });

        const result = await getUserPreferences(mockTx, "");
        expect(result).toEqual([]);
      });

      it("should handle database query failure", async () => {
        (mockTx.run as ReturnType<typeof vi.fn>).mockImplementation(() => {
          throw new Error("Query failed");
        });

        await expect(getUserPreferences(mockTx, "user-1")).rejects.toThrow(
          "Query failed",
        );
      });
    });

    describe("getPreference", () => {
      it("should handle empty userId", () => {
        (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
          records: [],
        });

        const result = getPreference(mockTx, "", "key");
        expect(result).toBeNull();
      });

      it("should handle empty key", () => {
        (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
          records: [],
        });

        const result = getPreference(mockTx, "user-1", "");
        expect(result).toBeNull();
      });

      it("should handle database query failure", () => {
        (mockTx.run as ReturnType<typeof vi.fn>).mockImplementation(() => {
          throw new Error("Query failed");
        });

        expect(() => getPreference(mockTx, "user-1", "key")).toThrow(
          "Query failed",
        );
      });
    });

    describe("deletePreference", () => {
      it("should handle empty userId", () => {
        deletePreference(mockTx, "", "key");
        expect(mockTx.run).toHaveBeenCalled();
      });

      it("should handle empty key", () => {
        deletePreference(mockTx, "user-1", "");
        expect(mockTx.run).toHaveBeenCalled();
      });

      it("should handle database transaction failure", () => {
        (mockTx.run as ReturnType<typeof vi.fn>).mockImplementation(() => {
          throw new Error("Transaction failed");
        });

        expect(() => deletePreference(mockTx, "user-1", "key")).toThrow(
          "Transaction failed",
        );
      });
    });

    describe("associateSessionWithUser", () => {
      it("should handle empty sessionId", () => {
        associateSessionWithUser(mockTx, "", "user-1");
        expect(mockTx.run).toHaveBeenCalled();
      });

      it("should handle empty userId", () => {
        associateSessionWithUser(mockTx, "session-1", "");
        expect(mockTx.run).toHaveBeenCalled();
      });

      it("should handle database transaction failure", () => {
        (mockTx.run as ReturnType<typeof vi.fn>).mockImplementation(() => {
          throw new Error("Transaction failed");
        });

        expect(() =>
          associateSessionWithUser(mockTx, "session-1", "user-1"),
        ).toThrow("Transaction failed");
      });
    });
  });
});
