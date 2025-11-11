import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NetworkError } from "../core/errors.js";
import { EmbeddingsClient, getEmbeddingsClient } from "./embeddings.js";

global.fetch = vi.fn();

describe("EmbeddingsClient", () => {
  let client: EmbeddingsClient;
  const mockBaseUrl = "http://localhost:12434/engines/llama.cpp/v1";
  const mockModel = "ai/mxbai-embed-large";

  beforeEach(() => {
    vi.clearAllMocks();
    client = new EmbeddingsClient(mockBaseUrl, mockModel);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should use provided baseUrl and model", () => {
      const customClient = new EmbeddingsClient(
        "http://custom:1234",
        "custom-model",
      );
      expect(customClient).toBeInstanceOf(EmbeddingsClient);
    });

    it("should use default values when not provided", () => {
      const defaultClient = new EmbeddingsClient();
      expect(defaultClient).toBeInstanceOf(EmbeddingsClient);
    });
  });

  describe("generateEmbedding", () => {
    it("should make POST request to embeddings endpoint", async () => {
      const mockEmbedding = [0.1, 0.2, 0.3, 0.4];
      const mockResponse = {
        data: [{ embedding: mockEmbedding }],
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.generateEmbedding("test text");

      expect(global.fetch).toHaveBeenCalledWith(
        `${mockBaseUrl}/embeddings`,
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );

      const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.model).toBe(mockModel);
      expect(body.input).toBe("test text");
      expect(result).toEqual(mockEmbedding);
    });

    it("should throw NetworkError on HTTP failure", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(client.generateEmbedding("text")).rejects.toThrow(
        NetworkError,
      );
      await expect(client.generateEmbedding("text")).rejects.toThrow(
        "HTTP error! status: 500",
      );
    });

    it("should throw NetworkError on network failure", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Network error"),
      );

      await expect(client.generateEmbedding("text")).rejects.toThrow(
        NetworkError,
      );
    });
  });

  describe("generateEmbeddings", () => {
    it("should generate embeddings for multiple texts", async () => {
      const mockEmbedding1 = [0.1, 0.2];
      const mockEmbedding2 = [0.3, 0.4];

      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [{ embedding: mockEmbedding1 }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [{ embedding: mockEmbedding2 }] }),
        });

      const result = await client.generateEmbeddings(["text1", "text2"]);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(mockEmbedding1);
      expect(result[1]).toEqual(mockEmbedding2);
    });

    it("should handle empty texts array", async () => {
      const result = await client.generateEmbeddings([]);
      expect(result).toEqual([]);
    });

    it("should handle partial failures in batch", async () => {
      const mockEmbedding1 = [0.1, 0.2];

      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [{ embedding: mockEmbedding1 }] }),
        })
        .mockRejectedValueOnce(new Error("Network error"));

      await expect(
        client.generateEmbeddings(["text1", "text2"]),
      ).rejects.toThrow("Network error");
    });
  });

  describe("edge cases and error handling", () => {
    describe("generateEmbedding", () => {
      it("should handle empty text", async () => {
        const mockEmbedding = [0.1, 0.2, 0.3, 0.4];
        const mockResponse = {
          data: [{ embedding: mockEmbedding }],
        };

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => mockResponse,
        });

        const result = await client.generateEmbedding("");
        expect(result).toEqual(mockEmbedding);
      });

      it("should handle empty data array", async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => ({ data: [] }),
        });

        await expect(client.generateEmbedding("text")).rejects.toThrow();
      });

      it("should handle null response", async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => null,
        });

        await expect(client.generateEmbedding("text")).rejects.toThrow();
      });

      it("should handle timeout", async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
          () =>
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Timeout")), 100),
            ),
        );

        await expect(client.generateEmbedding("text")).rejects.toThrow();
      });

      it("should handle partial network failure", async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => {
            throw new Error("JSON parse error");
          },
        });

        await expect(client.generateEmbedding("text")).rejects.toThrow();
      });

      it("should handle different HTTP error codes", async () => {
        for (const status of [400, 401, 403, 404, 429, 500, 503]) {
          (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
            ok: false,
            status,
            statusText: `Error ${status}`,
          });

          await expect(client.generateEmbedding("text")).rejects.toThrow();
        }
      });

      it("should handle missing embedding in response", async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => ({
            data: [{ embedding: null }],
          }),
        });

        const result = await client.generateEmbedding("text");
        expect(result).toBeNull();
      });
    });

    describe("generateEmbeddings", () => {
      it("should handle null texts array", async () => {
        await expect(
          client.generateEmbeddings(null as unknown as string[]),
        ).rejects.toThrow();
      });
    });
  });
});

describe("getEmbeddingsClient", () => {
  it("should return a EmbeddingsClient instance", () => {
    const client = getEmbeddingsClient();
    expect(client).toBeInstanceOf(EmbeddingsClient);
  });

  it("should return the same instance on subsequent calls", () => {
    const client1 = getEmbeddingsClient();
    const client2 = getEmbeddingsClient();
    expect(client1).toBe(client2);
  });
});
