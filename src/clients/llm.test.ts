import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NetworkError } from "../core/errors.js";
import { LLMClient, getLLMClient } from "./llm.js";

global.fetch = vi.fn();

describe("LLMClient", () => {
  let client: LLMClient;
  const mockBaseUrl = "http://localhost:12434/engines/llama.cpp/v1";
  const mockModel = "llama3.2";

  beforeEach(() => {
    vi.clearAllMocks();
    client = new LLMClient(mockBaseUrl, mockModel);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should use provided baseUrl and model", () => {
      const customClient = new LLMClient("http://custom:1234", "custom-model");
      expect(customClient).toBeInstanceOf(LLMClient);
    });

    it("should use default values when not provided", () => {
      const defaultClient = new LLMClient();
      expect(defaultClient).toBeInstanceOf(LLMClient);
    });
  });

  describe("generateResponse", () => {
    it("should make POST request to chat/completions endpoint", async () => {
      const mockResponse = {
        choices: [{ message: { content: "Test response" } }],
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.generateResponse("test prompt");

      expect(global.fetch).toHaveBeenCalledWith(
        `${mockBaseUrl}/chat/completions`,
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );

      expect(result).toBe("Test response");
    });

    it("should include system prompt when provided", async () => {
      const mockResponse = {
        choices: [{ message: { content: "Response" } }],
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await client.generateResponse("prompt", undefined, "system prompt");

      const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.messages).toHaveLength(2);
      expect(body.messages[0]).toEqual({
        role: "system",
        content: "system prompt",
      });
    });

    it("should include context when provided", async () => {
      const mockResponse = {
        choices: [{ message: { content: "Response" } }],
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await client.generateResponse("prompt", ["context1", "context2"]);

      const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.messages[0].content).toContain("Context information:");
      expect(body.messages[0].content).toContain("context1");
      expect(body.messages[0].content).toContain("context2");
    });

    it("should throw NetworkError on HTTP failure", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(client.generateResponse("prompt")).rejects.toThrow(
        NetworkError,
      );
      await expect(client.generateResponse("prompt")).rejects.toThrow(
        "HTTP error! status: 500",
      );
    });

    it("should throw NetworkError on network failure", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Network error"),
      );

      await expect(client.generateResponse("prompt")).rejects.toThrow(
        NetworkError,
      );
    });
  });

  describe("generateRagResponse", () => {
    it("should format documents as context", async () => {
      const mockResponse = {
        choices: [{ message: { content: "RAG response" } }],
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const documents = [
        { title: "Doc1", content: "Content1" },
        { title: "Doc2", content: "Content2" },
      ];

      await client.generateRagResponse("question", documents);

      const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      const userMessage = body.messages.find(
        (m: { role: string }) => m.role === "user",
      );
      expect(userMessage.content).toContain("Title: Doc1");
      expect(userMessage.content).toContain("Content1");
      expect(userMessage.content).toContain("Title: Doc2");
      expect(userMessage.content).toContain("Content2");
    });

    it("should use default system prompt when not provided", async () => {
      const mockResponse = {
        choices: [{ message: { content: "Response" } }],
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await client.generateRagResponse("question", []);

      const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.messages[0].role).toBe("system");
      expect(body.messages[0].content).toContain("knowledgeable AI assistant");
    });
  });

  describe("extractEntities", () => {
    it("should parse JSON entities from response", async () => {
      const mockEntities = [
        { type: "PERSON", name: "John Doe" },
        { type: "ORG", name: "Acme Corp" },
      ];

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(mockEntities) } }],
        }),
      });

      const result = await client.extractEntities(
        "John Doe works at Acme Corp",
      );

      expect(result).toEqual(mockEntities);
    });

    it("should return empty array on parse failure", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "invalid json" } }],
        }),
      });

      const result = await client.extractEntities("text");
      expect(result).toEqual([]);
    });

    it("should return empty array on non-array response", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"not": "array"}' } }],
        }),
      });

      const result = await client.extractEntities("text");
      expect(result).toEqual([]);
    });
  });

  describe("extractFacts", () => {
    it("should parse facts from response", async () => {
      const mockFacts = "Fact 1\nFact 2\nFact 3";

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: mockFacts } }],
        }),
      });

      const result = await client.extractFacts("text", ["entity1"]);

      expect(result).toEqual(["Fact 1", "Fact 2", "Fact 3"]);
    });

    it("should filter empty lines", async () => {
      const mockFacts = "Fact 1\n\nFact 2\n  \nFact 3";

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: mockFacts } }],
        }),
      });

      const result = await client.extractFacts("text", []);

      expect(result).toEqual(["Fact 1", "Fact 2", "Fact 3"]);
    });

    it("should return empty array on failure", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Network error"),
      );

      const result = await client.extractFacts("text", []);
      expect(result).toEqual([]);
    });
  });

  describe("edge cases and error handling", () => {
    describe("generateResponse", () => {
      it("should handle empty prompt", async () => {
        const mockResponse = {
          choices: [{ message: { content: "Response" } }],
        };

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => mockResponse,
        });

        const result = await client.generateResponse("");
        expect(result).toBe("Response");
      });

      it("should handle empty choices array", async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => ({ choices: [] }),
        });

        await expect(client.generateResponse("prompt")).rejects.toThrow();
      });

      it("should handle null response", async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => null,
        });

        await expect(client.generateResponse("prompt")).rejects.toThrow();
      });

      it("should handle timeout", async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
          () =>
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Timeout")), 100),
            ),
        );

        await expect(client.generateResponse("prompt")).rejects.toThrow();
      });

      it("should handle partial network failure", async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => {
            throw new Error("JSON parse error");
          },
        });

        await expect(client.generateResponse("prompt")).rejects.toThrow();
      });

      it("should handle different HTTP error codes", async () => {
        for (const status of [400, 401, 403, 404, 429, 500, 503]) {
          (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
            ok: false,
            status,
            statusText: `Error ${status}`,
          });

          await expect(client.generateResponse("prompt")).rejects.toThrow();
        }
      });
    });

    describe("generateRagResponse", () => {
      it("should handle empty documents array", async () => {
        const mockResponse = {
          choices: [{ message: { content: "Response" } }],
        };

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => mockResponse,
        });

        const result = await client.generateRagResponse("question", []);
        expect(result).toBe("Response");
      });

      it("should handle null documents", async () => {
        const mockResponse = {
          choices: [{ message: { content: "Response" } }],
        };

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => mockResponse,
        });

        await expect(
          client.generateRagResponse("question", null as unknown as []),
        ).rejects.toThrow();
      });
    });

    describe("extractEntities", () => {
      it("should handle empty text", async () => {
        const mockEntities = [];

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: JSON.stringify(mockEntities) } }],
          }),
        });

        const result = await client.extractEntities("");
        expect(result).toEqual([]);
      });

      it("should handle malformed JSON in response", async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: "{ invalid json" } }],
          }),
        });

        const result = await client.extractEntities("text");
        expect(result).toEqual([]);
      });

      it("should handle null response content", async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: null } }],
          }),
        });

        const result = await client.extractEntities("text");
        expect(result).toEqual([]);
      });
    });

    describe("extractFacts", () => {
      it("should handle empty text", async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: "" } }],
          }),
        });

        const result = await client.extractFacts("", []);
        expect(result).toEqual([]);
      });

      it("should handle empty entityIds array", async () => {
        const mockFacts = "Fact 1\nFact 2";

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: mockFacts } }],
          }),
        });

        const result = await client.extractFacts("text", []);
        expect(result).toEqual(["Fact 1", "Fact 2"]);
      });

      it("should handle null response content", async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: null } }],
          }),
        });

        const result = await client.extractFacts("text", []);
        expect(result).toEqual([]);
      });
    });
  });
});

describe("getLLMClient", () => {
  it("should return a LLMClient instance", () => {
    const client = getLLMClient();
    expect(client).toBeInstanceOf(LLMClient);
  });

  it("should return the same instance on subsequent calls", () => {
    const client1 = getLLMClient();
    const client2 = getLLMClient();
    expect(client1).toBe(client2);
  });
});
