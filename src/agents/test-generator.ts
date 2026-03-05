/**
 * Test Generator Agent
 *
 * Converts an AnalysisResult into one or more Playwright `.test.ts` files.
 *
 * Design patterns used:
 *   - API Object Model (AOM): Each API resource gets its own class that wraps
 *     the Playwright APIRequestContext, keeping request logic separate from
 *     assertion logic.
 *   - Builder Pattern: RequestBuilder allows optional chaining of headers,
 *     params, and body before sending.
 *   - Factory Pattern: TestDataFactory centralises example payload creation.
 *   - Arrange / Act / Assert (AAA): Every generated test follows this structure.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { AnalysisResult, GeneratedTestFile, TestScenario } from "../types/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toPascalCase(text: string): string {
  return text
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^[a-z]/, (c) => c.toUpperCase());
}

function toKebabCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function interpolatePath(
  urlPath: string,
  pathParams?: Record<string, string | number>
): string {
  if (!pathParams) return urlPath;
  return Object.entries(pathParams).reduce(
    (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
    urlPath
  );
}

function serializeSchema(schema: Record<string, unknown>): string {
  return JSON.stringify(schema, null, 4)
    .split("\n")
    .map((l, i) => (i === 0 ? l : `    ${l}`))
    .join("\n");
}

// ---------------------------------------------------------------------------
// Code generation helpers
// ---------------------------------------------------------------------------

function generateImports(hasContractCheck: boolean): string {
  const imports = [`import { test, expect, type APIRequestContext } from "@playwright/test";`];
  if (hasContractCheck) {
    imports.push(`import Ajv from "ajv";`);
    imports.push(`import addFormats from "ajv-formats";`);
  }
  return imports.join("\n");
}

function generateApiObjectModel(className: string, baseUrl: string): string {
  return `
/**
 * API Object Model — ${className}
 *
 * Encapsulates all HTTP interactions for the "${className}" resource.
 * Tests call methods on this object rather than issuing raw requests,
 * keeping test logic focused on assertions.
 */
class ${className}ApiObject {
  constructor(private readonly request: APIRequestContext) {}

  async get(urlPath: string, options?: { headers?: Record<string, string>; params?: Record<string, string> }) {
    return this.request.get(\`${baseUrl}\${urlPath}\`, options);
  }

  async post(urlPath: string, body: unknown, options?: { headers?: Record<string, string> }) {
    return this.request.post(\`${baseUrl}\${urlPath}\`, {
      data: body,
      headers: { "Content-Type": "application/json", ...options?.headers },
    });
  }

  async put(urlPath: string, body: unknown, options?: { headers?: Record<string, string> }) {
    return this.request.put(\`${baseUrl}\${urlPath}\`, {
      data: body,
      headers: { "Content-Type": "application/json", ...options?.headers },
    });
  }

  async patch(urlPath: string, body: unknown, options?: { headers?: Record<string, string> }) {
    return this.request.patch(\`${baseUrl}\${urlPath}\`, {
      data: body,
      headers: { "Content-Type": "application/json", ...options?.headers },
    });
  }

  async delete(urlPath: string, options?: { headers?: Record<string, string> }) {
    return this.request.delete(\`${baseUrl}\${urlPath}\`, options);
  }
}`;
}

function generateAjvSetup(): string {
  return `
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
`;
}

function generateTestBody(scenario: TestScenario): string {
  const ep = scenario.endpoint;
  const resolvedPath = interpolatePath(ep.path, ep.pathParams);
  const methodLower = ep.method.toLowerCase();

  // Build request options
  const extraHeaders: Record<string, string> = {};
  if (ep.headers) {
    ep.headers.forEach((h) => {
      extraHeaders[h.key] = h.value;
    });
  }

  const queryParams: Record<string, string> = {};
  if (ep.queryParams) {
    ep.queryParams.forEach((q) => {
      queryParams[q.key] = q.value;
    });
  }

  const hasQuery = Object.keys(queryParams).length > 0;
  const hasHeaders = Object.keys(extraHeaders).length > 0;

  const requestOptionsLines: string[] = [];
  if (hasHeaders) {
    requestOptionsLines.push(
      `headers: ${JSON.stringify(extraHeaders, null, 6).replace(/\n/g, "\n      ")}`
    );
  }
  if (hasQuery) {
    requestOptionsLines.push(
      `params: ${JSON.stringify(queryParams, null, 6).replace(/\n/g, "\n      ")}`
    );
  }

  const requestOptions =
    requestOptionsLines.length > 0
      ? `, { ${requestOptionsLines.join(", ")} }`
      : "";

  const isBodyMethod = ["post", "put", "patch"].includes(methodLower);
  const bodyArg = isBodyMethod ? `, ${JSON.stringify(ep.body ?? {}, null, 6)}` : "";

  const sendCall =
    isBodyMethod
      ? `api.${methodLower}("${resolvedPath}"${bodyArg}${requestOptions})`
      : `api.${methodLower}("${resolvedPath}"${requestOptions})`;

  const lines: string[] = [];

  switch (scenario.type) {
    case "status":
      lines.push(
        `  // Arrange`,
        `  const startTime = Date.now();`,
        ``,
        `  // Act`,
        `  const response = await ${sendCall};`,
        ``,
        `  // Assert — status code`,
        `  expect(response.status()).toBe(${scenario.expectedStatus});`,
        `  void startTime; // used in performance test`
      );
      break;

    case "response-body":
      lines.push(
        `  // Arrange & Act`,
        `  const response = await ${sendCall};`,
        ``,
        `  // Assert — response body is valid JSON`,
        `  expect(response.status()).toBe(${scenario.expectedStatus});`,
        `  const body = await response.json() as unknown;`,
        `  expect(body).toBeDefined();`,
        `  expect(typeof body === "object" || Array.isArray(body)).toBe(true);`
      );
      break;

    case "contract":
      if (ep.responseSchema) {
        const schemaStr = serializeSchema(ep.responseSchema);
        lines.push(
          `  // Arrange — JSON Schema for contract validation`,
          `  const schema = ${schemaStr};`,
          `  const validate = ajv.compile(schema);`,
          ``,
          `  // Act`,
          `  const response = await ${sendCall};`,
          ``,
          `  // Assert — response matches JSON Schema contract`,
          `  expect(response.status()).toBe(${scenario.expectedStatus});`,
          `  const body = await response.json() as unknown;`,
          `  const valid = validate(body);`,
          `  expect(valid, ajv.errorsText(validate.errors)).toBe(true);`
        );
      }
      break;

    case "headers":
      lines.push(
        `  // Act`,
        `  const response = await ${sendCall};`,
        ``,
        `  // Assert — Content-Type header is present`,
        `  expect(response.status()).toBe(${scenario.expectedStatus});`,
        `  const contentType = response.headers()["content-type"];`,
        `  expect(contentType).toBeDefined();`,
        `  expect(contentType).toContain("application/json");`
      );
      break;

    case "negative":
      lines.push(
        `  // Act — expect the API to respond with an error status`,
        `  const response = await ${sendCall};`,
        ``,
        `  // Assert — negative/error status code`,
        `  expect(response.status()).toBe(${scenario.expectedStatus});`
      );
      break;

    case "performance":
      lines.push(
        `  // Arrange`,
        `  const startTime = Date.now();`,
        ``,
        `  // Act`,
        `  const response = await ${sendCall};`,
        ``,
        `  // Assert — performance: response within 3000ms`,
        `  const elapsed = Date.now() - startTime;`,
        `  expect(response.status()).toBe(${scenario.expectedStatus});`,
        `  expect(elapsed).toBeLessThan(3_000);`
      );
      break;
  }

  return lines.join("\n");
}

function generateTestFile(
  analysis: AnalysisResult,
  scenarios: TestScenario[]
): string {
  const hasContractCheck = scenarios.some((s) => s.hasContractCheck);
  const className = toPascalCase(analysis.collectionName);

  const blocks: string[] = [];

  // Imports
  blocks.push(generateImports(hasContractCheck));

  // API Object Model
  blocks.push(generateApiObjectModel(className, analysis.baseUrl));

  // AJV setup (only when needed)
  if (hasContractCheck) {
    blocks.push(generateAjvSetup());
  }

  // Test suite
  const describeBody: string[] = [];

  // Fixture — instantiate API Object inside each test via test.use is implicit;
  // we create the api object inside each test for simplicity.
  describeBody.push(`  let api: ${className}ApiObject;\n`);
  describeBody.push(
    `  test.beforeEach(({ request }) => {`,
    `    api = new ${className}ApiObject(request);`,
    `  });\n`
  );

  // Individual tests
  for (const scenario of scenarios) {
    const body = generateTestBody(scenario);
    if (!body) continue;
    describeBody.push(
      `  test("${scenario.description}", async ({ request: _req }) => {`,
      `    void _req;`,
      body,
      `  });\n`
    );
  }

  blocks.push(
    `\ntest.describe("${analysis.collectionName} — API Tests", () => {\n${describeBody.join("\n")}\n});`
  );

  return blocks.join("\n");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates Playwright `.test.ts` files from an AnalysisResult and writes
 * them to the `tests/` directory under the project root.
 *
 * @param analysis - The result produced by `analyzeCollection`.
 * @param outputDir - Directory where test files are written (default: `tests/`).
 * @returns Array of GeneratedTestFile descriptors.
 */
export async function generateTests(
  analysis: AnalysisResult,
  outputDir: string = path.resolve("tests")
): Promise<GeneratedTestFile[]> {
  await fs.mkdir(outputDir, { recursive: true });

  const fileName = `${toKebabCase(analysis.collectionName)}.test.ts`;
  const filePath = path.join(outputDir, fileName);
  const content = generateTestFile(analysis, analysis.scenarios);

  await fs.writeFile(filePath, content, "utf-8");

  return [
    {
      filePath,
      content,
      testCount: analysis.scenarios.length,
    },
  ];
}
