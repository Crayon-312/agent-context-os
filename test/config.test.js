import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadProjectConfig, validateConfig } from "../agent/src/config.js";

function validConfig() {
  return {
    schema_version: 3,
    project_id: "test-project",
    project_name: "Test Project",
    agent: { name: "Agent Context OS", mode: "thin-launcher", version: "0.2.0", source: "." },
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
  assert.ok(issues.includes("schema_version must be 1, 2 or 3"));
  assert.ok(issues.includes("memory.local_index.provider must be 'embedded-json'"));
  assert.ok(issues.includes("memory.sources[0].required_frontmatter must be a non-empty array of non-empty strings"));
});

test("normalizes legacy schema 2 engine configuration to the Agent descriptor", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-legacy-config-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, ".agent-context"));
  const config = validConfig();
  config.schema_version = 2;
  config.engine = config.agent;
  delete config.agent;
  await writeFile(path.join(root, ".agent-context", "config.json"), JSON.stringify(config), "utf8");

  const loaded = await loadProjectConfig(root);
  assert.equal(loaded.config.agent.version, "0.2.0");
  assert.equal(loaded.config.engine, undefined);
});

test("schema 3 rejects the legacy engine field", () => {
  const config = validConfig();
  config.engine = config.agent;
  delete config.agent;
  const issues = validateConfig(config);
  assert.ok(issues.includes("agent must be an object"));
  assert.ok(issues.includes("schema_version 3 must use 'agent', not 'engine'"));
});
