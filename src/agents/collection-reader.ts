/**
 * Collection Reader Agent
 *
 * Reads and validates an API collection JSON file, returning a structured
 * ApiCollection object. The validation uses Zod so error messages are
 * helpful and precise.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { ApiCollection } from "../types/index.js";

// ---------------------------------------------------------------------------
// Zod schema — mirrors the TypeScript types in src/types/index.ts
// ---------------------------------------------------------------------------

const HeaderSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
});

const QueryParamSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
});

const HttpMethodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

const EndpointDefinitionSchema = z.object({
  name: z.string().min(1, "Endpoint name is required"),
  method: HttpMethodSchema,
  path: z.string().min(1, "Endpoint path is required"),
  description: z.string().optional(),
  headers: z.array(HeaderSchema).optional(),
  queryParams: z.array(QueryParamSchema).optional(),
  body: z.unknown().optional(),
  expectedStatus: z.number().int().min(100).max(599).optional(),
  negativeStatusCodes: z.array(z.number().int().min(100).max(599)).optional(),
  responseSchema: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
  pathParams: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});

const ApiCollectionSchema = z.object({
  name: z.string().min(1, "Collection name is required"),
  baseUrl: z.string().url("baseUrl must be a valid URL"),
  description: z.string().optional(),
  defaultHeaders: z.array(HeaderSchema).optional(),
  version: z.string().optional(),
  endpoints: z
    .array(EndpointDefinitionSchema)
    .min(1, "At least one endpoint is required"),
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reads a JSON collection file from the given path and returns a validated
 * ApiCollection object.
 *
 * @param filePath - Absolute or relative path to the collection JSON file.
 * @throws {Error} When the file cannot be read or the content is invalid.
 */
export async function readCollection(filePath: string): Promise<ApiCollection> {
  const resolved = path.resolve(filePath);

  let raw: string;
  try {
    raw = await fs.readFile(resolved, "utf-8");
  } catch (err) {
    throw new Error(
      `Cannot read collection file at "${resolved}": ${(err as NodeJS.ErrnoException).message}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Collection file "${resolved}" contains invalid JSON: ${(err as Error).message}`
    );
  }

  const result = ApiCollectionSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Collection file "${resolved}" failed validation:\n${issues}`);
  }

  return result.data as ApiCollection;
}
