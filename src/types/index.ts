/**
 * Core type definitions for the MCP API Test Orchestrator.
 */

// ---------------------------------------------------------------------------
// Collection (input format)
// ---------------------------------------------------------------------------

/** A single header entry. */
export interface Header {
  key: string;
  value: string;
}

/** A query-parameter entry. */
export interface QueryParam {
  key: string;
  value: string;
}

/** A JSON Schema object (subset used for contract testing). */
export type JsonSchema = Record<string, unknown>;

/** HTTP methods supported by the orchestrator. */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

/** Describes a single API endpoint in the collection. */
export interface EndpointDefinition {
  /** Human-readable name, e.g. "Get User by ID". */
  name: string;
  /** HTTP method. */
  method: HttpMethod;
  /** Path relative to baseUrl, e.g. "/users/{id}". Supports {param} placeholders. */
  path: string;
  /** Optional description for documentation. */
  description?: string;
  /** Request headers. */
  headers?: Header[];
  /** URL query parameters. */
  queryParams?: QueryParam[];
  /** Request body (for POST/PUT/PATCH). */
  body?: unknown;
  /** Expected HTTP status code. Defaults to 200. */
  expectedStatus?: number;
  /** Optional list of expected status codes (for negative tests). */
  negativeStatusCodes?: number[];
  /** JSON Schema for the response body (used in contract testing). */
  responseSchema?: JsonSchema;
  /** Additional tags used to group tests. */
  tags?: string[];
  /** Example path-parameter values to substitute in the path. */
  pathParams?: Record<string, string | number>;
}

/** Top-level collection file. */
export interface ApiCollection {
  /** Collection name. */
  name: string;
  /** Base URL for all endpoints, e.g. "https://jsonplaceholder.typicode.com". */
  baseUrl: string;
  /** Optional description. */
  description?: string;
  /** Default headers applied to every request. */
  defaultHeaders?: Header[];
  /** API version identifier. */
  version?: string;
  /** The endpoint definitions. */
  endpoints: EndpointDefinition[];
}

// ---------------------------------------------------------------------------
// Analyzer output
// ---------------------------------------------------------------------------

/** A single test scenario that the analyzer wants to generate. */
export interface TestScenario {
  /** Unique identifier for the scenario (derived from endpoint + type). */
  id: string;
  /** Human-readable description of the test. */
  description: string;
  /** The endpoint this scenario tests. */
  endpoint: EndpointDefinition;
  /** Category of test. */
  type: "status" | "response-body" | "contract" | "headers" | "negative" | "performance";
  /** Expected outcome (used in assertions). */
  expectedStatus: number;
  /** Whether a JSON Schema contract check is included. */
  hasContractCheck: boolean;
}

/** Analyzer output: a set of scenarios grouped by endpoint. */
export interface AnalysisResult {
  collectionName: string;
  baseUrl: string;
  scenarios: TestScenario[];
  summary: {
    totalEndpoints: number;
    totalScenarios: number;
    withContractChecks: number;
  };
}

// ---------------------------------------------------------------------------
// Generator output
// ---------------------------------------------------------------------------

/** A generated test file. */
export interface GeneratedTestFile {
  /** Output file path (relative to project root). */
  filePath: string;
  /** Full TypeScript source code. */
  content: string;
  /** Number of test cases in this file. */
  testCount: number;
}

// ---------------------------------------------------------------------------
// Runner output
// ---------------------------------------------------------------------------

/** Result of a single test case. */
export interface TestCaseResult {
  title: string;
  status: "passed" | "failed" | "skipped" | "timedOut";
  durationMs: number;
  error?: string;
}

/** Aggregated result returned by the test runner. */
export interface TestRunResult {
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  testResults: TestCaseResult[];
  reportPath?: string;
}
