import type { Record as Neo4jRecord } from "neo4j-driver";

interface Neo4jResult {
  records?: Neo4jRecord[];
}

interface PromiseLikeResult {
  then?: (
    onFulfilled?: (
      value: Neo4jResult,
    ) => Neo4jResult | PromiseLike<Neo4jResult>,
  ) => Promise<Neo4jResult>;
}

export function getRecords<T = Neo4jRecord>(result: unknown): T[] {
  if (!result) {
    return [];
  }

  const resultAny = result as Neo4jResult;

  if (resultAny.records && Array.isArray(resultAny.records)) {
    return resultAny.records as T[];
  }

  return [];
}

export async function getRecordsAsync<T = Neo4jRecord>(
  result: unknown,
): Promise<T[]> {
  if (!result) {
    return [];
  }

  const resultAny = result as Neo4jResult & PromiseLikeResult;

  if (resultAny.records && Array.isArray(resultAny.records)) {
    return resultAny.records as T[];
  }

  if (resultAny.then && typeof resultAny.then === "function") {
    const resolved = await resultAny.then();
    if (resolved && resolved.records && Array.isArray(resolved.records)) {
      return resolved.records as T[];
    }
  }

  return [];
}
