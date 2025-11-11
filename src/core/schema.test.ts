import { describe, it, expect, vi, beforeEach } from "vitest";
import neo4j from "neo4j-driver";
import {
  createVectorIndexes,
  createConstraints,
  createIndexes,
  initializeSchema,
} from "./schema.js";
import type { Session, ManagedTransaction } from "neo4j-driver";

describe("schema", () => {
  let mockTx: ManagedTransaction;
  let mockSession: Session;

  beforeEach(() => {
    mockTx = {
      run: vi.fn(),
    } as unknown as ManagedTransaction;

    mockSession = {
      executeWrite: vi.fn(async (fn) => {
        await fn(mockTx);
      }),
    } as unknown as Session;
  });

  describe("createVectorIndexes", () => {
    it("should create two vector indexes", () => {
      createVectorIndexes(mockTx);
      expect(mockTx.run).toHaveBeenCalledTimes(2);
    });

    it("should create message embedding index with correct dimensions", () => {
      createVectorIndexes(mockTx);
      const calls = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0][0]).toContain("msg_emb_idx");
      expect(calls[0][0]).toContain("Message");
      expect(neo4j.isInt(calls[0][1].dimensions)).toBe(true);
      expect(calls[0][1].dimensions.toNumber()).toBe(1024);
    });

    it("should create fact embedding index with correct dimensions", () => {
      createVectorIndexes(mockTx);
      const calls = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[1][0]).toContain("fact_emb_idx");
      expect(calls[1][0]).toContain("Fact");
      expect(neo4j.isInt(calls[1][1].dimensions)).toBe(true);
      expect(calls[1][1].dimensions.toNumber()).toBe(1024);
    });
  });

  describe("createConstraints", () => {
    it("should create six constraints", () => {
      createConstraints(mockTx);
      expect(mockTx.run).toHaveBeenCalledTimes(6);
    });

    it("should create session_id constraint", () => {
      createConstraints(mockTx);
      const calls = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0][0]).toContain("session_id");
      expect(calls[0][0]).toContain("Session");
    });

    it("should create message_id constraint", () => {
      createConstraints(mockTx);
      const calls = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[1][0]).toContain("message_id");
      expect(calls[1][0]).toContain("Message");
    });

    it("should create user_id constraint", () => {
      createConstraints(mockTx);
      const calls = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[2][0]).toContain("user_id");
      expect(calls[2][0]).toContain("User");
    });

    it("should create entity_canonical_id constraint", () => {
      createConstraints(mockTx);
      const calls = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[3][0]).toContain("entity_canonical_id");
      expect(calls[3][0]).toContain("Entity");
    });

    it("should create fact_id constraint", () => {
      createConstraints(mockTx);
      const calls = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[4][0]).toContain("fact_id");
      expect(calls[4][0]).toContain("Fact");
    });

    it("should create tool_call_id constraint", () => {
      createConstraints(mockTx);
      const calls = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[5][0]).toContain("tool_call_id");
      expect(calls[5][0]).toContain("ToolCall");
    });
  });

  describe("createIndexes", () => {
    it("should create four indexes", () => {
      createIndexes(mockTx);
      expect(mockTx.run).toHaveBeenCalledTimes(4);
    });

    it("should create message_ts index", () => {
      createIndexes(mockTx);
      const calls = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0][0]).toContain("message_ts");
      expect(calls[0][0]).toContain("Message");
    });

    it("should create entity_type_name index", () => {
      createIndexes(mockTx);
      const calls = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[1][0]).toContain("entity_type_name");
      expect(calls[1][0]).toContain("Entity");
    });

    it("should create tool_call_status index", () => {
      createIndexes(mockTx);
      const calls = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[2][0]).toContain("tool_call_status");
      expect(calls[2][0]).toContain("ToolCall");
    });

    it("should create preference_key index", () => {
      createIndexes(mockTx);
      const calls = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[3][0]).toContain("preference_key");
      expect(calls[3][0]).toContain("Preference");
    });
  });

  describe("initializeSchema", () => {
    it("should call executeWrite three times", async () => {
      await initializeSchema(mockSession);
      expect(mockSession.executeWrite).toHaveBeenCalledTimes(3);
    });

    it("should call createConstraints, createIndexes, and createVectorIndexes", async () => {
      await initializeSchema(mockSession);
      const calls = (mockSession.executeWrite as ReturnType<typeof vi.fn>).mock
        .calls;
      expect(calls.length).toBe(3);
    });
  });
});
