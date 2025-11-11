import {
  EMBED_MODEL,
  EMBEDDING_TIMEOUT_MS,
  OLLAMA_BASE_URL,
} from "../core/config.js";
import { NetworkError, TimeoutError } from "../core/errors.js";

interface EmbeddingResponse {
  data: Array<{
    embedding: number[];
  }>;
}

export class EmbeddingsClient {
  private baseUrl: string;
  private embedModel: string;

  constructor(baseUrl?: string, model?: string) {
    this.baseUrl = baseUrl || OLLAMA_BASE_URL;
    this.embedModel = model || EMBED_MODEL;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.embedModel,
          input: text,
        }),
        signal: AbortSignal.timeout(EMBEDDING_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new NetworkError(`HTTP error! status: ${response.status}`, {
          statusCode: response.status,
        });
      }

      const data = (await response.json()) as EmbeddingResponse;
      return data.data[0].embedding;
    } catch (error) {
      if (error instanceof NetworkError) {
        throw error;
      }
      if (
        error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError")
      ) {
        throw new TimeoutError("Request timed out", {
          cause: error,
          timeoutMs: EMBEDDING_TIMEOUT_MS,
        });
      }
      if (error instanceof TypeError && error.message.includes("fetch")) {
        throw new NetworkError("Network request failed", { cause: error });
      }
      throw new NetworkError(
        `Failed to generate embedding: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => this.generateEmbedding(text)));
  }
}

let _client: EmbeddingsClient | null = null;

export function getEmbeddingsClient(): EmbeddingsClient {
  if (_client === null) {
    _client = new EmbeddingsClient();
  }
  return _client;
}
