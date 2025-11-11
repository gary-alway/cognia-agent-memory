import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

interface MCPClient {
  client: Client;
  transport: StdioClientTransport;
}

interface BenchmarkResult {
  tool: string;
  iterations: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  p99: number;
}

async function createMCPClient(): Promise<MCPClient> {
  const serverPath = join(projectRoot, "dist", "src", "server", "mcp-server.js");

  const transport = new StdioClientTransport({
    command: "node",
    args: [serverPath],
    env: process.env as Record<string, string>,
    cwd: projectRoot,
  });

  const client = new Client(
    {
      name: "benchmark-client",
      version: "1.0.0",
    },
    {
      capabilities: {},
    },
  );

  await client.connect(transport);

  return { client, transport };
}

function calculateStats(times: number[]): Omit<BenchmarkResult, "tool" | "iterations"> {
  const sorted = [...times].sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sum / times.length,
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
  };
}

async function benchmarkTool(
  client: Client,
  toolName: string,
  args: Record<string, unknown>,
  iterations: number = 10,
): Promise<BenchmarkResult> {
  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await client.callTool({ name: toolName, arguments: args });
    const end = performance.now();
    times.push(end - start);
  }

  const stats = calculateStats(times);
  return {
    tool: toolName,
    iterations,
    ...stats,
  };
}

describe("MCP Server Performance Benchmarks", () => {
  let mcpClient: MCPClient | null = null;
  const results: BenchmarkResult[] = [];

  beforeAll(async () => {
    mcpClient = await createMCPClient();
  });

  afterAll(async () => {
    if (mcpClient) {
      await mcpClient.transport.close();
    }

    console.log("\n=== MCP Server Performance Benchmark Results ===\n");
    console.log(
      "Tool".padEnd(20) +
        "Iterations".padEnd(12) +
        "Min (ms)".padEnd(12) +
        "Max (ms)".padEnd(12) +
        "Mean (ms)".padEnd(12) +
        "Median (ms)".padEnd(12) +
        "P95 (ms)".padEnd(12) +
        "P99 (ms)",
    );
    console.log("-".repeat(100));

    for (const result of results) {
      console.log(
        result.tool.padEnd(20) +
          result.iterations.toString().padEnd(12) +
          result.min.toFixed(2).padEnd(12) +
          result.max.toFixed(2).padEnd(12) +
          result.mean.toFixed(2).padEnd(12) +
          result.median.toFixed(2).padEnd(12) +
          result.p95.toFixed(2).padEnd(12) +
          result.p99.toFixed(2),
      );
    }

    console.log("\nNote: Results are in milliseconds. Update docs/performance.md with these results.\n");
  });

  it("benchmark: get_session_info", async () => {
    const result = await benchmarkTool(mcpClient!.client, "get_session_info", {}, 20);
    results.push(result);
  });

  it("benchmark: set_preference", async () => {
    const result = await benchmarkTool(
      mcpClient!.client,
      "set_preference",
      { key: "benchmark_test", value: "test_value" },
      20,
    );
    results.push(result);
  });

  it("benchmark: get_preferences", async () => {
    const result = await benchmarkTool(mcpClient!.client, "get_preferences", {}, 20);
    results.push(result);
  });

  it("benchmark: store_memory (simple)", async () => {
    const result = await benchmarkTool(
      mcpClient!.client,
      "store_memory",
      {
        role: "user",
        content: "This is a simple test message for benchmarking.",
      },
      10,
    );
    results.push(result);
  });

  it("benchmark: store_memory (with entities)", async () => {
    const result = await benchmarkTool(
      mcpClient!.client,
      "store_memory",
      {
        role: "user",
        content:
          "John Smith works at Acme Corporation. The company is located in San Francisco and specializes in cloud computing solutions.",
      },
      10,
    );
    results.push(result);
  });

  it("benchmark: recall_memories (simple query)", async () => {
    const result = await benchmarkTool(
      mcpClient!.client,
      "recall_memories",
      { query: "test query", top_k: 5 },
      10,
    );
    results.push(result);
  });

  it("benchmark: track_tool_usage", async () => {
    const result = await benchmarkTool(
      mcpClient!.client,
      "track_tool_usage",
      {
        tool_name: "test_tool",
        args: { param: "value" },
        status: "success",
        description: "Test tool execution",
      },
      20,
    );
    results.push(result);
  });
});
