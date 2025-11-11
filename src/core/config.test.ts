import { describe, it, expect } from "vitest";
import * as config from "./config.js";

describe("config", () => {
  it("should have default values for Neo4j configuration", () => {
    expect(config.NEO4J_URI).toBeDefined();
    expect(config.NEO4J_USER).toBeDefined();
    expect(config.NEO4J_PASSWORD).toBeDefined();
  });

  it("should have default values for Ollama configuration", () => {
    expect(config.OLLAMA_HOST).toBeDefined();
    expect(config.OLLAMA_PORT).toBeDefined();
    expect(config.OLLAMA_BASE_URL).toContain("http://");
    expect(config.OLLAMA_BASE_URL).toContain("/engines/llama.cpp/v1");
  });

  it("should have default values for model configuration", () => {
    expect(config.EMBED_MODEL).toBeDefined();
    expect(config.LLM_MODEL).toBeDefined();
  });

  it("should have correct EMBEDDING_DIMENSION constant", () => {
    expect(config.EMBEDDING_DIMENSION).toBe(1024);
  });

  it("should have default values for MinIO configuration", () => {
    expect(config.MINIO_ENDPOINT).toBeDefined();
    expect(config.MINIO_ACCESS_KEY).toBeDefined();
    expect(config.MINIO_SECRET_KEY).toBeDefined();
    expect(config.MINIO_BUCKET).toBeDefined();
    expect(typeof config.MINIO_SECURE).toBe("boolean");
  });

  it("should have numeric values for memory configuration", () => {
    expect(typeof config.MEMORY_DECAY_DAYS).toBe("number");
    expect(typeof config.ARCHIVE_AGE_DAYS).toBe("number");
    expect(config.MEMORY_DECAY_DAYS).toBeGreaterThan(0);
    expect(config.ARCHIVE_AGE_DAYS).toBeGreaterThan(0);
  });
});
