/**
 * Test Analyzer Agent
 *
 * Takes an ApiCollection and produces a list of TestScenario objects that
 * cover:
 *   - Status code assertions (happy path + negative)
 *   - Response body shape validation
 *   - JSON Schema contract testing
 *   - Response header checks
 *   - Basic performance (response time) assertions
 */

import type {
  ApiCollection,
  AnalysisResult,
  TestScenario,
  EndpointDefinition,
} from "../types/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ---------------------------------------------------------------------------
// Scenario builders
// ---------------------------------------------------------------------------

function buildStatusScenario(
  endpoint: EndpointDefinition,
  endpointIndex: number
): TestScenario {
  const expectedStatus = endpoint.expectedStatus ?? 200;
  return {
    id: `${toId(endpoint.name)}-${endpointIndex}-status`,
    description: `[${endpoint.method}] ${endpoint.path} → responds with ${expectedStatus}`,
    endpoint,
    type: "status",
    expectedStatus,
    hasContractCheck: false,
  };
}

function buildResponseBodyScenario(
  endpoint: EndpointDefinition,
  endpointIndex: number
): TestScenario {
  const expectedStatus = endpoint.expectedStatus ?? 200;
  return {
    id: `${toId(endpoint.name)}-${endpointIndex}-body`,
    description: `[${endpoint.method}] ${endpoint.path} → response body is valid JSON`,
    endpoint,
    type: "response-body",
    expectedStatus,
    hasContractCheck: false,
  };
}

function buildContractScenario(
  endpoint: EndpointDefinition,
  endpointIndex: number
): TestScenario {
  const expectedStatus = endpoint.expectedStatus ?? 200;
  return {
    id: `${toId(endpoint.name)}-${endpointIndex}-contract`,
    description: `[${endpoint.method}] ${endpoint.path} → response matches JSON Schema contract`,
    endpoint,
    type: "contract",
    expectedStatus,
    hasContractCheck: true,
  };
}

function buildHeadersScenario(
  endpoint: EndpointDefinition,
  endpointIndex: number
): TestScenario {
  const expectedStatus = endpoint.expectedStatus ?? 200;
  return {
    id: `${toId(endpoint.name)}-${endpointIndex}-headers`,
    description: `[${endpoint.method}] ${endpoint.path} → Content-Type header is present`,
    endpoint,
    type: "headers",
    expectedStatus,
    hasContractCheck: false,
  };
}

function buildNegativeScenarios(
  endpoint: EndpointDefinition,
  endpointIndex: number
): TestScenario[] {
  const codes = endpoint.negativeStatusCodes ?? [];
  return codes.map((code) => ({
    id: `${toId(endpoint.name)}-${endpointIndex}-negative-${code}`,
    description: `[${endpoint.method}] ${endpoint.path} → handles error response ${code}`,
    endpoint,
    type: "negative" as const,
    expectedStatus: code,
    hasContractCheck: false,
  }));
}

function buildPerformanceScenario(
  endpoint: EndpointDefinition,
  endpointIndex: number
): TestScenario {
  const expectedStatus = endpoint.expectedStatus ?? 200;
  return {
    id: `${toId(endpoint.name)}-${endpointIndex}-perf`,
    description: `[${endpoint.method}] ${endpoint.path} → responds within 3000ms`,
    endpoint,
    type: "performance",
    expectedStatus,
    hasContractCheck: false,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyzes a collection and returns a full set of test scenarios.
 */
export function analyzeCollection(collection: ApiCollection): AnalysisResult {
  const scenarios: TestScenario[] = [];

  collection.endpoints.forEach((endpoint, idx) => {
    // Every endpoint gets: status + body + headers + performance checks
    scenarios.push(buildStatusScenario(endpoint, idx));
    scenarios.push(buildResponseBodyScenario(endpoint, idx));
    scenarios.push(buildHeadersScenario(endpoint, idx));
    scenarios.push(buildPerformanceScenario(endpoint, idx));

    // Contract testing only when a responseSchema is provided
    if (endpoint.responseSchema) {
      scenarios.push(buildContractScenario(endpoint, idx));
    }

    // Negative tests for any explicitly listed error status codes
    const negativeScenarios = buildNegativeScenarios(endpoint, idx);
    scenarios.push(...negativeScenarios);
  });

  const contractCount = scenarios.filter((s) => s.hasContractCheck).length;

  return {
    collectionName: collection.name,
    baseUrl: collection.baseUrl,
    scenarios,
    summary: {
      totalEndpoints: collection.endpoints.length,
      totalScenarios: scenarios.length,
      withContractChecks: contractCount,
    },
  };
}
