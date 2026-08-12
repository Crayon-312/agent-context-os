import assert from "node:assert/strict";
import test from "node:test";
import { validateConfig } from "../engine/src/config.js";

function validConfig() {
  return {
    schema_version: 2,
    project_id: "test-project",
    project_name: "Test Project",
    engine: { name: "Agent Context OS", mode: "thin-launcher", version: "0.1.0", source: "." },
    memory: {
      sources: [{
        id: "vault",
        provider: "obsidian",
        path: "knowledge",
        required_frontmatter: ["id", "type", "status", "summary"]
      }],
      local_index: { provider: "embedded-json", path: ".agent-context/local-index", git_tracked: false }
    }
  };
}

test("accepts the supported configuration contract", () => {
  assert.deepEqual(validateConfig(validConfig()), []);
});

test("rejects unsupported schema, index provider and malformed source options", () => {
  const config = validConfig();
  config.schema_version = 999;
  config.memory.local_index.provider = "unknown";
  config.memory.sources[0].required_frontmatter = "id";

  const issues = validateConfig(config);
  assert.ok(issues.includes("schema_version must be 1 or 2"));
  assert.ok(issues.includes("memory.local_index.provider must be 'embedded-json'"));
  assert.ok(issues.includes("memory.sources[0].required_frontmatter must be a non-empty array of non-empty strings"));
});
