/**
 * Test Runner Agent
 *
 * Invokes Playwright Test via a child process, captures the JSON reporter
 * output, and returns a structured TestRunResult.
 */

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { TestRunResult, TestCaseResult } from "../types/index.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface PlaywrightJsonResult {
  stats?: {
    expected?: number;
    unexpected?: number;
    skipped?: number;
    duration?: number;
  };
  suites?: PlaywrightSuite[];
}

interface PlaywrightSuite {
  title?: string;
  specs?: PlaywrightSpec[];
  suites?: PlaywrightSuite[];
}

interface PlaywrightSpec {
  title?: string;
  tests?: PlaywrightTestEntry[];
}

interface PlaywrightTestEntry {
  status?: string;
  results?: PlaywrightTestEntryResult[];
}

interface PlaywrightTestEntryResult {
  status?: string;
  duration?: number;
  error?: { message?: string };
}

function flattenSpecs(suite: PlaywrightSuite): PlaywrightSpec[] {
  const specs: PlaywrightSpec[] = [];
  if (suite.specs) specs.push(...suite.specs);
  if (suite.suites) {
    for (const child of suite.suites) {
      specs.push(...flattenSpecs(child));
    }
  }
  return specs;
}

function runPlaywright(
  projectRoot: string,
  testDir: string
): Promise<{ exitCode: number; stdout: string }> {
  return new Promise((resolve) => {
    const npx = process.platform === "win32" ? "npx.cmd" : "npx";
    const args = [
      "playwright",
      "test",
      "--reporter=json",
      `--config=${path.join(projectRoot, "playwright.config.ts")}`,
      testDir,
    ];

    let stdout = "";

    const child = spawn(npx, args, {
      cwd: projectRoot,
      env: { ...process.env, FORCE_COLOR: "0" },
    });

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", () => { /* intentionally ignored */ });
    child.on("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout });
    });
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Runs all generated Playwright tests and returns a structured summary.
 *
 * @param projectRoot - Root directory of the project (where playwright.config.ts lives).
 * @param testDir     - Directory containing generated .test.ts files (default: `tests/`).
 */
export async function runTests(
  projectRoot: string = process.cwd(),
  testDir: string = path.join(projectRoot, "tests")
): Promise<TestRunResult> {
  const resultsJsonPath = path.join(projectRoot, "test-results", "results.json");

  const startMs = Date.now();
  const { stdout } = await runPlaywright(projectRoot, testDir);
  const durationMs = Date.now() - startMs;

  // Attempt to parse the JSON reporter output from stdout first,
  // then fall back to the file written by the config reporter.
  let jsonOutput: PlaywrightJsonResult | null = null;

  const jsonMatch = stdout.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      jsonOutput = JSON.parse(jsonMatch[0]) as PlaywrightJsonResult;
    } catch {
      // ignore parse errors; try file below
    }
  }

  if (!jsonOutput) {
    try {
      const raw = await fs.readFile(resultsJsonPath, "utf-8");
      jsonOutput = JSON.parse(raw) as PlaywrightJsonResult;
    } catch {
      // No JSON output at all — return a minimal error result
      return {
        totalTests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        durationMs,
        testResults: [],
        reportPath: path.join(projectRoot, "playwright-report", "index.html"),
      };
    }
  }

  // Flatten specs from all suites
  const allSpecs: PlaywrightSpec[] = [];
  if (jsonOutput.suites) {
    for (const suite of jsonOutput.suites) {
      allSpecs.push(...flattenSpecs(suite));
    }
  }

  const testResults: TestCaseResult[] = allSpecs.flatMap((spec) => {
    const title = spec.title ?? "Unknown";
    return (spec.tests ?? []).map((t) => {
      const res = t.results?.[0];
      const rawStatus = res?.status ?? t.status ?? "skipped";
      let status: TestCaseResult["status"] = "skipped";
      if (rawStatus === "passed") status = "passed";
      else if (rawStatus === "failed" || rawStatus === "unexpected") status = "failed";
      else if (rawStatus === "timedOut") status = "timedOut";

      return {
        title,
        status,
        durationMs: res?.duration ?? 0,
        error: res?.error?.message,
      } satisfies TestCaseResult;
    });
  });

  const passed = testResults.filter((r) => r.status === "passed").length;
  const failed = testResults.filter((r) => r.status === "failed" || r.status === "timedOut").length;
  const skipped = testResults.filter((r) => r.status === "skipped").length;

  return {
    totalTests: testResults.length,
    passed,
    failed,
    skipped,
    durationMs,
    testResults,
    reportPath: path.join(projectRoot, "playwright-report", "index.html"),
  };
}
