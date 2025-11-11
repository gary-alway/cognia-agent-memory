# Roadmap

## Performance Optimizations

- [ ] **Embedding Storage in Archived Data**: Store embeddings in archived JSON to avoid on-the-fly generation (currently adds ~1000ms latency when `include_archived=true`)
  - Store embeddings alongside messages in archived session JSON
  - Update `archived_retrieval.ts` to use stored embeddings instead of generating on-the-fly
  - Update archival process to include embeddings when archiving sessions

## Incomplete Features

- [ ] **Delete Archived Sessions from Neo4j**: Currently archival stores to MinIO but doesn't delete from Neo4j
  - Add option to delete archived sessions from Neo4j after successful archival
  - Make it configurable (default: keep in Neo4j for safety)
  - Add verification that archival succeeded before deletion

