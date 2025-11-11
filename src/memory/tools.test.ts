import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedTransaction } from "neo4j-driver";
import neo4j from "neo4j-driver";
import {
  getFailedThenSuccessfulPatterns,
  getSuccessfulToolPatterns,
  linkToolResultToMessage,
  storeToolCall,
  updateToolCallStatus,
} from "./tools.js";

describe("tools", () => {
  let mockTx: ManagedTransaction;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTx = {
      run: vi.fn(),
    } as unknown as ManagedTransaction;
  });

  describe("storeToolCall", () => {
    it("should store a tool call and return its ID", () => {
      const args = { query: "test", limit: 10 };
      const toolCallId = storeToolCall(
        mockTx,
        "msg-123",
        "search",
        args,
        "pending",
      );

      expect(toolCallId).toBeDefined();
      expect(mockTx.run).toHaveBeenCalledTimes(1);
      const callArgs = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].name).toBe("search");
      expect(callArgs[1].args).toBe(JSON.stringify(args));
      expect(callArgs[1].status).toBe("pending");
      expect(callArgs[1].message_id).toBe("msg-123");
    });

    it("should use default status of pending", () => {
      const args = { query: "test" };
      storeToolCall(mockTx, "msg-123", "search", args);

      const callArgs = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].status).toBe("pending");
    });

    it("should include optional latency and result", () => {
      const args = { query: "test" };
      storeToolCall(
        mockTx,
        "msg-123",
        "search",
        args,
        "success",
        100,
        "result",
      );

      const callArgs = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].latency).toBe(100);
      expect(callArgs[1].result).toBe("result");
    });
  });

  describe("updateToolCallStatus", () => {
    it("should update tool call status", () => {
      updateToolCallStatus(mockTx, "tool-123", "success", 50, "result");

      expect(mockTx.run).toHaveBeenCalledTimes(1);
      const callArgs = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].tool_call_id).toBe("tool-123");
      expect(callArgs[1].status).toBe("success");
      expect(callArgs[1].latency).toBe(50);
      expect(callArgs[1].result).toBe("result");
    });

    it("should handle optional parameters", () => {
      updateToolCallStatus(mockTx, "tool-123", "success");

      const callArgs = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].status).toBe("success");
      expect(callArgs[1].latency).toBeUndefined();
      expect(callArgs[1].result).toBeUndefined();
    });
  });

  describe("linkToolResultToMessage", () => {
    it("should link tool result to message", () => {
      linkToolResultToMessage(mockTx, "tool-123", "msg-456");

      expect(mockTx.run).toHaveBeenCalledTimes(1);
      const callArgs = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].tool_call_id).toBe("tool-123");
      expect(callArgs[1].result_message_id).toBe("msg-456");
    });
  });

  describe("getSuccessfulToolPatterns", () => {
    it("should return successful tool patterns", () => {
      const mockRecords = [
        {
          get: vi.fn((key: string) => {
            const values: Record<
              string,
              string | ReturnType<typeof neo4j.int>
            > = {
              id: "tool-1",
              args: '{"query":"test"}',
              latency: neo4j.int(100),
              context: "test context",
            };
            return values[key];
          }),
        },
      ];

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: mockRecords,
      });

      const result = getSuccessfulToolPatterns(mockTx, "search");

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("tool-1");
      expect(result[0].args).toBe('{"query":"test"}');
      expect(result[0].latency).toBe(100);
      expect(result[0].context).toBe("test context");
    });

    it("should handle missing latency", () => {
      const mockRecords = [
        {
          get: vi.fn((key: string) => {
            const values: Record<string, string | undefined> = {
              id: "tool-1",
              args: '{"query":"test"}',
              latency: undefined,
              context: "test context",
            };
            return values[key];
          }),
        },
      ];

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: mockRecords,
      });

      const result = getSuccessfulToolPatterns(mockTx, "search");

      expect(result[0].latency).toBeUndefined();
    });

    it("should use default limit of 10", () => {
      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: [],
      });

      getSuccessfulToolPatterns(mockTx, "search");

      const callArgs = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].limit).toBe(10);
    });

    it("should use custom limit", () => {
      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: [],
      });

      getSuccessfulToolPatterns(mockTx, "search", 5);

      const callArgs = (mockTx.run as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].limit).toBe(5);
    });
  });

  describe("getFailedThenSuccessfulPatterns", () => {
    it("should return failed then successful patterns", () => {
      const mockRecords = [
        {
          get: vi.fn((key: string) => {
            const values: Record<string, string> = {
              failed_args: '{"query":"bad"}',
              success_args: '{"query":"good"}',
              failed_context: "failed context",
              success_context: "success context",
            };
            return values[key];
          }),
        },
      ];

      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: mockRecords,
      });

      const result = getFailedThenSuccessfulPatterns(mockTx, "search");

      expect(result).toHaveLength(1);
      expect(result[0].failedArgs).toBe('{"query":"bad"}');
      expect(result[0].successArgs).toBe('{"query":"good"}');
      expect(result[0].failedContext).toBe("failed context");
      expect(result[0].successContext).toBe("success context");
    });

    it("should return empty array when no patterns found", () => {
      (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
        records: [],
      });

      const result = getFailedThenSuccessfulPatterns(mockTx, "search");

      expect(result).toEqual([]);
    });
  });

  describe("edge cases and error handling", () => {
    describe("storeToolCall", () => {
      it("should handle empty messageId", () => {
        const toolCallId = storeToolCall(mockTx, "", "tool", {}, "pending");
        expect(toolCallId).toBeDefined();
      });

      it("should handle empty toolName", () => {
        const toolCallId = storeToolCall(mockTx, "msg-1", "", {}, "pending");
        expect(toolCallId).toBeDefined();
      });

      it("should handle null args", () => {
        const toolCallId = storeToolCall(
          mockTx,
          "msg-1",
          "tool",
          null as unknown as Record<string, unknown>,
          "pending",
        );
        expect(toolCallId).toBeDefined();
      });

      it("should handle database transaction failure", () => {
        (mockTx.run as ReturnType<typeof vi.fn>).mockImplementation(() => {
          throw new Error("Transaction failed");
        });

        expect(() =>
          storeToolCall(mockTx, "msg-1", "tool", {}, "pending"),
        ).toThrow("Transaction failed");
      });
    });

    describe("updateToolCallStatus", () => {
      it("should handle empty toolCallId", () => {
        updateToolCallStatus(mockTx, "", "success");
        expect(mockTx.run).toHaveBeenCalled();
      });

      it("should handle database transaction failure", () => {
        (mockTx.run as ReturnType<typeof vi.fn>).mockImplementation(() => {
          throw new Error("Transaction failed");
        });

        expect(() => updateToolCallStatus(mockTx, "tool-1", "success")).toThrow(
          "Transaction failed",
        );
      });
    });

    describe("linkToolResultToMessage", () => {
      it("should handle empty toolCallId", () => {
        linkToolResultToMessage(mockTx, "", "msg-1");
        expect(mockTx.run).toHaveBeenCalled();
      });

      it("should handle empty resultMessageId", () => {
        linkToolResultToMessage(mockTx, "tool-1", "");
        expect(mockTx.run).toHaveBeenCalled();
      });

      it("should handle database transaction failure", () => {
        (mockTx.run as ReturnType<typeof vi.fn>).mockImplementation(() => {
          throw new Error("Transaction failed");
        });

        expect(() =>
          linkToolResultToMessage(mockTx, "tool-1", "msg-1"),
        ).toThrow("Transaction failed");
      });
    });

    describe("getSuccessfulToolPatterns", () => {
      it("should handle empty toolName", () => {
        (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
          records: [],
        });

        const result = getSuccessfulToolPatterns(mockTx, "");
        expect(result).toEqual([]);
      });

      it("should handle database query failure", () => {
        (mockTx.run as ReturnType<typeof vi.fn>).mockImplementation(() => {
          throw new Error("Query failed");
        });

        expect(() => getSuccessfulToolPatterns(mockTx, "tool")).toThrow(
          "Query failed",
        );
      });

      it("should handle invalid limit values", () => {
        (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
          records: [],
        });
        getSuccessfulToolPatterns(mockTx, "tool", 0);
        expect(mockTx.run).toHaveBeenCalled();
        getSuccessfulToolPatterns(mockTx, "tool", -1);
        expect(mockTx.run).toHaveBeenCalled();
      });
    });

    describe("getFailedThenSuccessfulPatterns", () => {
      it("should handle empty toolName", () => {
        (mockTx.run as ReturnType<typeof vi.fn>).mockReturnValue({
          records: [],
        });

        const result = getFailedThenSuccessfulPatterns(mockTx, "");
        expect(result).toEqual([]);
      });

      it("should handle database query failure", () => {
        (mockTx.run as ReturnType<typeof vi.fn>).mockImplementation(() => {
          throw new Error("Query failed");
        });

        expect(() => getFailedThenSuccessfulPatterns(mockTx, "tool")).toThrow(
          "Query failed",
        );
      });
    });
  });
});
