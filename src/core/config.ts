import dotenv from "dotenv";

dotenv.config();

export const NEO4J_URI = process.env.NEO4J_URI || "bolt://localhost:7687";
export const NEO4J_USER = process.env.NEO4J_USER || "neo4j";
export const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || "password";

export const OLLAMA_HOST = process.env.OLLAMA_HOST || "localhost";
export const OLLAMA_PORT = process.env.OLLAMA_PORT || "12434";
export const OLLAMA_BASE_URL = `http://${OLLAMA_HOST}:${OLLAMA_PORT}/engines/llama.cpp/v1`;

export const EMBED_MODEL = process.env.EMBED_MODEL || "ai/mxbai-embed-large";
export const LLM_MODEL = process.env.LLM_MODEL || "llama3.2";

export const EMBEDDING_DIMENSION = 1024;

export const LLM_TIMEOUT_MS = parseInt(
  process.env.LLM_TIMEOUT_MS || "60000",
  10,
);
export const EMBEDDING_TIMEOUT_MS = parseInt(
  process.env.EMBEDDING_TIMEOUT_MS || "30000",
  10,
);

export const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || "localhost:9000";
export const MINIO_ACCESS_KEY = process.env.MINIO_ROOT_USER || "minioadmin";
export const MINIO_SECRET_KEY = process.env.MINIO_ROOT_PASSWORD || "minioadmin";
export const MINIO_BUCKET = process.env.MINIO_BUCKET || "agent-memory";
export const MINIO_SECURE = process.env.MINIO_SECURE?.toLowerCase() === "true";

export const MEMORY_DECAY_DAYS = parseInt(
  process.env.MEMORY_DECAY_DAYS || "30",
  10,
);
export const ARCHIVE_AGE_DAYS = parseInt(
  process.env.ARCHIVE_AGE_DAYS || "90",
  10,
);

function validateConfig(): void {
  const errors: string[] = [];

  if (!NEO4J_URI || NEO4J_URI.trim() === "") {
    errors.push("NEO4J_URI is required");
  }
  if (!NEO4J_USER || NEO4J_USER.trim() === "") {
    errors.push("NEO4J_USER is required");
  }
  if (!NEO4J_PASSWORD || NEO4J_PASSWORD.trim() === "") {
    errors.push("NEO4J_PASSWORD is required");
  }

  if (!OLLAMA_HOST || OLLAMA_HOST.trim() === "") {
    errors.push("OLLAMA_HOST is required");
  }
  if (!OLLAMA_PORT || OLLAMA_PORT.trim() === "") {
    errors.push("OLLAMA_PORT is required");
  }

  if (!EMBED_MODEL || EMBED_MODEL.trim() === "") {
    errors.push("EMBED_MODEL is required");
  }
  if (!LLM_MODEL || LLM_MODEL.trim() === "") {
    errors.push("LLM_MODEL is required");
  }

  if (!MINIO_ENDPOINT || MINIO_ENDPOINT.trim() === "") {
    errors.push("MINIO_ENDPOINT is required");
  }
  if (!MINIO_ACCESS_KEY || MINIO_ACCESS_KEY.trim() === "") {
    errors.push("MINIO_ACCESS_KEY is required");
  }
  if (!MINIO_SECRET_KEY || MINIO_SECRET_KEY.trim() === "") {
    errors.push("MINIO_SECRET_KEY is required");
  }
  if (!MINIO_BUCKET || MINIO_BUCKET.trim() === "") {
    errors.push("MINIO_BUCKET is required");
  }

  if (isNaN(MEMORY_DECAY_DAYS) || MEMORY_DECAY_DAYS < 0) {
    errors.push("MEMORY_DECAY_DAYS must be a non-negative number");
  }
  if (isNaN(ARCHIVE_AGE_DAYS) || ARCHIVE_AGE_DAYS < 0) {
    errors.push("ARCHIVE_AGE_DAYS must be a non-negative number");
  }

  if (errors.length > 0) {
    throw new Error(
      `Configuration validation failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
    );
  }
}

validateConfig();
