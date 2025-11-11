import { z } from "zod";

export const nonEmptyStringSchema = z.string().trim().min(1);

export const positiveIntegerInRangeSchema = (min: number, max: number) =>
  z.number().int().min(min).max(max);

export const numberInRangeSchema = (min: number, max: number) =>
  z.number().min(min).max(max);

export const embeddingSchema = (dimension: number) =>
  z
    .array(z.number().finite())
    .length(dimension, `Embedding must have dimension ${dimension}`);

export function validateNonEmptyString(value: unknown): string {
  return nonEmptyStringSchema.parse(value);
}

export function validatePositiveInteger(
  value: unknown,
  min: number = 1,
  max: number = Number.MAX_SAFE_INTEGER,
): number {
  return positiveIntegerInRangeSchema(min, max).parse(value);
}

export function validateNumberInRange(
  value: unknown,
  min: number,
  max: number,
): number {
  return numberInRangeSchema(min, max).parse(value);
}

export function validateEmbedding(
  embedding: unknown,
  dimension: number,
): number[] {
  return embeddingSchema(dimension).parse(embedding);
}

export const entitySchema = z.object({
  type: z.string(),
  name: z.string(),
});

export const entityArraySchema = z.array(entitySchema);

export function validateEntities(
  value: unknown,
): Array<{ type: string; name: string }> {
  return entityArraySchema.parse(value);
}

export function validateObjectName(value: unknown): string {
  const str = nonEmptyStringSchema.parse(value);

  if (!str.startsWith("sessions/")) {
    throw new Error("Object name must start with 'sessions/'");
  }

  if (!str.endsWith(".json")) {
    throw new Error("Object name must end with '.json'");
  }

  if (str.includes("..") || str.includes("//")) {
    throw new Error("Object name contains invalid path characters");
  }

  const parts = str.split("/");
  if (parts.length !== 3) {
    throw new Error(
      "Object name must match pattern: sessions/{sessionId}/{timestamp}.json",
    );
  }

  return str;
}
