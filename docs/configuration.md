# Configuration Reference

Complete reference for all configuration options in Cognia.

## Environment Variables

### Neo4j Database

| Variable         | Default                 | Description                          |
| ---------------- | ----------------------- | ------------------------------------ |
| `NEO4J_URI`      | `bolt://localhost:7687` | Neo4j connection URI (Bolt protocol) |
| `NEO4J_USER`     | `neo4j`                 | Neo4j username                       |
| `NEO4J_PASSWORD` | `password`              | Neo4j password                       |

### Ollama (LLM & Embeddings)

| Variable               | Default                | Description                                                 |
| ---------------------- | ---------------------- | ----------------------------------------------------------- |
| `OLLAMA_HOST`          | `localhost`            | Ollama server hostname                                      |
| `OLLAMA_PORT`          | `12434`                | Ollama server port                                          |
| `EMBED_MODEL`          | `ai/mxbai-embed-large` | Embedding model name (must be available in Ollama)          |
| `LLM_MODEL`            | `llama3.2`             | LLM model name (must be available in Ollama)                |
| `LLM_TIMEOUT_MS`       | `60000`                | Timeout for LLM requests in milliseconds (60 seconds)       |
| `EMBEDDING_TIMEOUT_MS` | `30000`                | Timeout for embedding requests in milliseconds (30 seconds) |

### MinIO (Object Storage)

| Variable              | Default          | Description                                                 |
| --------------------- | ---------------- | ----------------------------------------------------------- |
| `MINIO_ENDPOINT`      | `localhost:9000` | MinIO server endpoint (host:port)                           |
| `MINIO_ROOT_USER`     | `minioadmin`     | MinIO root username (maps to `MINIO_ACCESS_KEY`)            |
| `MINIO_ROOT_PASSWORD` | `minioadmin`     | MinIO root password (maps to `MINIO_SECRET_KEY`)            |
| `MINIO_BUCKET`        | `agent-memory`   | MinIO bucket name for archived sessions                     |
| `MINIO_SECURE`        | `false`          | Use HTTPS for MinIO connections (set to `"true"` to enable) |

**Note:** `recall_memories` searches both active Neo4j data and archived MinIO sessions by default, merging and reranking results together. Set `include_archived=false` to search only recent data for faster queries.

### Memory Management

| Variable            | Default | Description                                                                                               |
| ------------------- | ------- | --------------------------------------------------------------------------------------------------------- |
| `MEMORY_DECAY_DAYS` | `30`    | Days before memory importance starts decaying                                                             |
| `ARCHIVE_AGE_DAYS`  | `90`    | Days before sessions are archived to MinIO (archived sessions are still searchable via `recall_memories`) |

### Logging

| Variable    | Default | Description                                    |
| ----------- | ------- | ---------------------------------------------- |
| `LOG_LEVEL` | `info`  | Log level: `debug`, `info`, `warn`, or `error` |

## Configuration Validation

All required environment variables are validated on application startup. If any required variable is missing or invalid, the application will fail to start with a clear error message.

Required variables:

- All Neo4j variables
- All Ollama variables (except timeouts, which have defaults)
- All MinIO variables
- `MEMORY_DECAY_DAYS` and `ARCHIVE_AGE_DAYS` must be non-negative numbers

## Example `.env` File

```bash
# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-secure-password

# Ollama
OLLAMA_HOST=localhost
OLLAMA_PORT=12434
EMBED_MODEL=ai/mxbai-embed-large
LLM_MODEL=llama3.2
LLM_TIMEOUT_MS=60000
EMBEDDING_TIMEOUT_MS=30000

# MinIO
MINIO_ENDPOINT=localhost:9000
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=your-secure-password
MINIO_BUCKET=agent-memory
MINIO_SECURE=false

# Memory
MEMORY_DECAY_DAYS=30
ARCHIVE_AGE_DAYS=90

# Logging
LOG_LEVEL=info
```

## Tuning Recommendations

### Timeouts

- **LLM_TIMEOUT_MS**: Increase if you're using slower models or have network latency
- **EMBEDDING_TIMEOUT_MS**: Usually fine at 30s, but increase for slower embedding models

### Memory Management

- **MEMORY_DECAY_DAYS**: Lower values make older memories less important faster
- **ARCHIVE_AGE_DAYS**: Adjust based on your storage needs and retention policies
