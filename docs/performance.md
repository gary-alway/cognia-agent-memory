# Performance Benchmarks

Performance benchmarks for the Cognia MCP server. These benchmarks measure response times for each MCP tool under typical usage conditions.

## Running Benchmarks

Run the performance benchmarks with:

```bash
yarn test:benchmark
```

Or as part of all e2e tests:

```bash
yarn test:e2e
```

## Benchmark Results

Results are measured in milliseconds (ms). Each benchmark runs multiple iterations to calculate statistics.

### Last Run: 2025-11-12

| Tool                         | Iterations | Min (ms) | Max (ms) | Mean (ms) | Median (ms) | P95 (ms) | P99 (ms) |
| ---------------------------- | ---------- | -------- | -------- | --------- | ----------- | -------- | -------- |
| get_session_info             | 20         | 0.14     | 2.46     | 0.68      | 0.38        | 2.46     | 2.46     |
| set_preference               | 20         | 1.32     | 20.48    | 2.89      | 1.78        | 20.48    | 20.48    |
| get_preferences              | 20         | 0.99     | 6.70     | 1.64      | 1.31        | 6.70     | 6.70     |
| store_memory (simple)        | 10         | 94.76    | 141.18   | 118.44    | 118.47      | 141.18   | 141.18   |
| store_memory (with entities) | 10         | 87.08    | 148.53   | 121.62    | 120.13      | 148.53   | 148.53   |
| recall_memories              | 10         | 749.95   | 1470.04  | 1027.63   | 1070.88     | 1470.04  | 1470.04  |
| track_tool_usage             | 20         | 83.85    | 98.08    | 91.36     | 92.43       | 98.08    | 98.08    |

**Note:** `recall_memories` searches archived sessions by default (`include_archived=true`), adding ~1s latency due to MinIO I/O overhead (listing and fetching session files). Pre-stored embeddings eliminate embedding generation latency. Set `include_archived=false` to query only recent data for ~90ms response times.
