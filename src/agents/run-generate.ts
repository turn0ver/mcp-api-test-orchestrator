/**
 * CLI helper used by GitHub Actions to generate tests without starting the
 * full MCP server transport.
 *
 * Usage:
 *   node --import tsx/esm src/agents/run-generate.ts <collectionPath> [outputDir]
 */

import path from "node:path";
import { readCollection } from "./collection-reader.js";
import { analyzeCollection } from "./test-analyzer.js";
import { generateTests } from "./test-generator.js";

const [, , collectionArg, outputDirArg] = process.argv;

if (!collectionArg) {
  console.error("Usage: run-generate.ts <collectionPath> [outputDir]");
  process.exit(1);
}

const collectionPath = path.resolve(collectionArg);
const outputDir = outputDirArg ? path.resolve(outputDirArg) : path.resolve("tests");

console.log(`Reading collection: ${collectionPath}`);
const collection = await readCollection(collectionPath);
console.log(`Collection loaded: "${collection.name}" (${collection.endpoints.length} endpoints)`);

const analysis = analyzeCollection(collection);
console.log(
  `Analysis complete: ${analysis.summary.totalScenarios} scenarios across ${analysis.summary.totalEndpoints} endpoints`
);

const files = await generateTests(analysis, outputDir);
for (const f of files) {
  console.log(`Generated: ${f.filePath}  (${f.testCount} test cases)`);
}

console.log("Done.");
