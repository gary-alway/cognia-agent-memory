# Roadmap

## Features

- [ ] **Delete Archived Sessions from Neo4j**: Currently archival stores to MinIO but doesn't delete from Neo4j
  - Add option to delete archived sessions from Neo4j after successful archival
  - Make it configurable (default: keep in Neo4j for safety)
  - Add verification that archival succeeded before deletion

- [ ] **Restore Tool Calls from Archived Sessions**: Tool calls cannot be restored from archived sessions
  - Current archival format doesn't preserve tool-to-message relationships
  - Need to store tool call relationships in archived JSON
  - Update `restoreSessionToNeo4j()` to recreate tool call nodes and relationships

## Testing

- [ ] **Manual Test Script**: Create comprehensive manual test script to prove all Cognia features work
  - Test all MCP tools (store_memory, recall_memories, track_tool_usage, preferences, session_info)
  - Test memory ingestion and retrieval
  - Test entity extraction and fact storage
  - Test archival and restoration
  - Test semantic search with embeddings
