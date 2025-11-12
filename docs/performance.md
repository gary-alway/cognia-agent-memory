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
| get_session_info             | 20         | 0.15     | 2.77     | 0.58      | 0.34        | 2.77     | 2.77     |
| set_preference               | 20         | 1.49     | 5.83     | 2.11      | 1.86        | 5.83     | 5.83     |
| get_preferences              | 20         | 0.93     | 1.85     | 1.18      | 1.16        | 1.85     | 1.85     |
| store_memory (simple)        | 10         | 101.78   | 131.23   | 117.20    | 114.96      | 131.23   | 131.23   |
| store_memory (with entities) | 10         | 74.66    | 160.89   | 126.25    | 136.93      | 160.89   | 160.89   |
| recall_memories              | 10         | 77.55    | 117.92   | 89.81     | 84.69       | 117.92   | 117.92   |
| track_tool_usage             | 20         | 90.63    | 104.68   | 95.77     | 95.94       | 104.68   | 104.68   |
