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

### Last Run: 2025-11-10 (Archived Memory Disabled by Default)

| Tool | Iterations | Min (ms) | Max (ms) | Mean (ms) | Median (ms) | P95 (ms) | P99 (ms) |
|------|------------|---------|----------|-----------|-------------|----------|----------|
| get_session_info | 20 | 0.11 | 1.70 | 0.52 | 0.30 | 1.70 | 1.70 |
| set_preference | 20 | 1.27 | 8.00 | 2.07 | 1.54 | 8.00 | 8.00 |
| get_preferences | 20 | 0.88 | 1.39 | 1.05 | 1.00 | 1.39 | 1.39 |
| store_memory (simple) | 10 | 75.16 | 117.01 | 83.34 | 80.62 | 117.01 | 117.01 |
| store_memory (with entities) | 10 | 73.09 | 84.58 | 78.51 | 78.89 | 84.58 | 84.58 |
| recall_memories (default) | 10 | 84.52 | 96.20 | 91.67 | 93.07 | 96.20 | 96.20 |
| recall_memories (with archived) | 10 | 763.85 | 1366.02 | 1051.86 | 1178.92 | 1366.02 | 1366.02 |
| track_tool_usage | 20 | 82.91 | 114.20 | 90.91 | 89.64 | 114.20 | 114.20 |

**Note:** `recall_memories` is fast by default (mean ~92ms) with `include_archived=false`. When `include_archived=true` is enabled, latency increases significantly (mean ~1052ms) due to on-the-fly embedding generation for archived messages. Archived memory is **disabled by default** to maintain fast response times. Enable it only when you need to search long-term archived data. Performance varies based on the number of archived sessions and messages per session. Storing embeddings in archived data is documented as a future optimization.
