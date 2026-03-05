#!/usr/bin/env node
/**
 * MCP API Test Orchestrator — Server Entry Point
 *
 * Exposes four tools via the Model Context Protocol:
 *
 *  1. read_collection   — Parse & validate a JSON collection file.
 *  2. analyze_endpoints — Derive test scenarios from the collection.
 *  3. generate_tests    — Write .test.ts files (API Object Model pattern).
 *  4. run_tests         — Execute Playwright and return structured results.
 *
 * Run with:
 *   npx tsx src/server.ts        (development)
 *   node dist/server.js          (production, after `npm run build`)
 */

import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { readCollection } from "./agents/collection-reader.js";
import { analyzeCollection } from "./agents/test-analyzer.js";
import { generateTests } from "./agents/test-generator.js";
import { runTests } from "./agents/test-runner.js";

// ---------------------------------------------------------------------------
// Server bootstrap
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "mcp-api-test-orchestrator",
  version: "1.0.0",
});

// ---------------------------------------------------------------------------
// Tool: read_collection
// ---------------------------------------------------------------------------

server.registerTool(
  "read_collection",
  {
    title: "Read API Collection",
    description:
      "Reads and validates an API collection JSON file. " +
      "Parameter: collectionPath — absolute or relative path to the collection JSON file. " +
      "Returns the parsed collection with all endpoints.",
    inputSchema: {
      collectionPath: z.string(),
    },
  },
  async ({ collectionPath }) => {
    try {
      const collection = await readCollection(collectionPath);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(collection, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error reading collection: ${(err as Error).message}` }],
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: analyze_endpoints
// ---------------------------------------------------------------------------

server.registerTool(
  "analyze_endpoints",
  {
    title: "Analyze API Endpoints",
    description:
      "Reads a collection file, analyzes each endpoint, and returns " +
      "a list of test scenarios (status, body, contract, headers, performance, negative). " +
      "Parameter: collectionPath — absolute or relative path to the collection JSON file.",
    inputSchema: {
      collectionPath: z.string(),
    },
  },
  async ({ collectionPath }) => {
    try {
      const collection = await readCollection(collectionPath);
      const analysis = analyzeCollection(collection);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(analysis, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        isError: true,
        content: [
          { type: "text", text: `Error analyzing endpoints: ${(err as Error).message}` },
        ],
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: generate_tests
// ---------------------------------------------------------------------------

server.registerTool(
  "generate_tests",
  {
    title: "Generate Playwright Tests",
    description:
      "Reads a collection, analyzes it, and generates Playwright .test.ts files " +
      "in the specified output directory using the API Object Model design pattern. " +
      "Parameters: collectionPath (required) — path to the collection JSON file; " +
      "outputDir (optional) — directory where test files are written (default: `tests/`).",
    inputSchema: {
      collectionPath: z.string(),
      outputDir: z.string().optional(),
    },
  },
  async ({ collectionPath, outputDir }) => {
    try {
      const collection = await readCollection(collectionPath);
      const analysis = analyzeCollection(collection);
      const resolvedOutputDir = outputDir
        ? path.resolve(outputDir)
        : path.resolve("tests");
      const files = await generateTests(analysis, resolvedOutputDir);

      const summary = files
        .map(
          (f) =>
            `• ${path.relative(process.cwd(), f.filePath)}  (${f.testCount} scenarios)`
        )
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text:
              `Generated ${files.length} test file(s):\n${summary}\n\n` +
              `Analysis summary:\n${JSON.stringify(analysis.summary, null, 2)}`,
          },
        ],
      };
    } catch (err) {
      return {
        isError: true,
        content: [
          { type: "text", text: `Error generating tests: ${(err as Error).message}` },
        ],
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: run_tests
// ---------------------------------------------------------------------------

server.registerTool(
  "run_tests",
  {
    title: "Run Playwright Tests",
    description:
      "Executes all generated Playwright tests in the specified directory and " +
      "returns structured results (pass/fail counts, durations, error messages). " +
      "Parameters: projectRoot (optional) — root dir of the project (default: cwd); " +
      "testDir (optional) — directory containing .test.ts files (default: `tests/`).",
    inputSchema: {
      projectRoot: z.string().optional(),
      testDir: z.string().optional(),
    },
  },
  async ({ projectRoot, testDir }) => {
    try {
      const root = projectRoot ? path.resolve(projectRoot) : process.cwd();
      const dir = testDir ? path.resolve(testDir) : path.join(root, "tests");
      const result = await runTests(root, dir);

      const statusLine =
        result.failed === 0
          ? `✅ All ${result.passed} test(s) passed.`
          : `❌ ${result.failed} test(s) failed, ${result.passed} passed, ${result.skipped} skipped.`;

      const details = result.testResults
        .map((t) => {
          const icon =
            t.status === "passed" ? "✅" : t.status === "skipped" ? "⏭" : "❌";
          const err = t.error ? `\n      Error: ${t.error.slice(0, 200)}` : "";
          return `  ${icon} ${t.title} (${t.durationMs}ms)${err}`;
        })
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text:
              `${statusLine}\n` +
              `Duration: ${result.durationMs}ms\n` +
              `Report: ${result.reportPath ?? "N/A"}\n\n` +
              `Test Results:\n${details || "  (no results)"}`,
          },
        ],
      };
    } catch (err) {
      return {
        isError: true,
        content: [
          { type: "text", text: `Error running tests: ${(err as Error).message}` },
        ],
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
