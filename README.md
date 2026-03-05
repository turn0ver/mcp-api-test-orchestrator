# mcp-api-test-orchestrator

An **MCP (Model Context Protocol) server** that orchestrates the full lifecycle of API and Contract testing using **Playwright** and **TypeScript**.

Feed it an endpoint collection JSON file and it automatically:

1. **Reads & validates** the collection (`read_collection`)
2. **Analyzes** every endpoint and derives test scenarios (`analyze_endpoints`)
3. **Generates** Playwright `.test.ts` files following the *API Object Model* design pattern (`generate_tests`)
4. **Runs** the tests and returns structured pass/fail results (`run_tests`)

Everything is wired into **GitHub Actions CI/CD** — tests run on every push.

---

## Architecture

```
mcp-api-test-orchestrator/
├── src/
│   ├── server.ts                  # MCP server — exposes 4 tools
│   ├── agents/
│   │   ├── collection-reader.ts   # Parses & validates collection JSON (Zod)
│   │   ├── test-analyzer.ts       # Derives test scenarios per endpoint
│   │   ├── test-generator.ts      # Generates .test.ts (API Object Model)
│   │   ├── test-runner.ts         # Spawns Playwright, parses results
│   │   └── run-generate.ts        # CLI helper used by CI
│   └── types/
│       └── index.ts               # Shared TypeScript types
├── examples/
│   └── collection.json            # Example: JSONPlaceholder API (9 endpoints)
├── tests/                         # Generated test files (git-ignored)
├── playwright.config.ts
├── tsconfig.json
├── package.json
└── .github/
    └── workflows/
        └── api-tests.yml          # CI/CD pipeline
```

---

## Collection Format

Create a JSON file describing your API:

```json
{
  "name": "My API",
  "baseUrl": "https://api.example.com",
  "endpoints": [
    {
      "name": "Get User",
      "method": "GET",
      "path": "/users/{id}",
      "pathParams": { "id": 1 },
      "expectedStatus": 200,
      "responseSchema": {
        "type": "object",
        "required": ["id", "name"],
        "properties": {
          "id":   { "type": "integer" },
          "name": { "type": "string" }
        }
      }
    }
  ]
}
```

See [`examples/collection.json`](examples/collection.json) for a complete example using the free [JSONPlaceholder](https://jsonplaceholder.typicode.com) API.

---

## Generated Test Types

For each endpoint the generator creates:

| Type | Description |
|------|-------------|
| `status` | Asserts the HTTP status code |
| `response-body` | Asserts the body is valid, non-null JSON |
| `headers` | Asserts `Content-Type: application/json` is present |
| `performance` | Asserts response time < 3 000 ms |
| `contract` | Validates body against the JSON Schema (when `responseSchema` is set) |
| `negative` | Tests listed error status codes (when `negativeStatusCodes` is set) |

### Design Patterns

* **API Object Model (AOM)** — each collection gets a typed class wrapping `APIRequestContext`
* **Arrange / Act / Assert (AAA)** — every test follows this structure
* **Builder helpers** — `get`, `post`, `put`, `patch`, `delete` methods with typed options

---

## MCP Tools

Start the server and connect with any MCP-compatible client (Claude Desktop, etc.):

```json
{
  "mcpServers": {
    "api-test-orchestrator": {
      "command": "node",
      "args": ["/path/to/mcp-api-test-orchestrator/dist/server.js"]
    }
  }
}
```

| Tool | Description |
|------|-------------|
| `read_collection` | Parse and validate a collection JSON file |
| `analyze_endpoints` | Derive test scenarios from the collection |
| `generate_tests` | Write `.test.ts` files to disk |
| `run_tests` | Execute Playwright and return structured results |

---

## Quick Start (CLI)

```bash
# 1. Install
npm install
npm run build

# 2. Generate tests
node --import tsx/esm src/agents/run-generate.ts examples/collection.json tests/

# 3. Install Playwright browsers (first time only)
npx playwright install chromium

# 4. Run tests
npm test

# 5. Open HTML report
npm run test:report
```

---

## GitHub Actions

The workflow at [`.github/workflows/api-tests.yml`](.github/workflows/api-tests.yml) runs on every push and:

1. Installs dependencies
2. Type-checks the source
3. Builds the MCP server
4. Generates tests from `examples/collection.json`
5. Runs Playwright tests
6. Uploads the HTML report and JSON results as artifacts
7. Posts a markdown summary to the Actions job

You can trigger it manually and supply a custom `collection_path` input.
