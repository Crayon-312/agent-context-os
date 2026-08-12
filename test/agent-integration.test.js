import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadProjectConfig } from "../agent/src/config.js";
import { buildIndex, loadIndex, validateProject } from "../agent/src/index-store.js";
import { searchIndex } from "../agent/src/search.js";

test("builds a local index and retrieves evidence from an Obsidian vault", async (context) => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-agent-"));
  context.after(() => rm(projectRoot, { recursive: true, force: true }));
  await mkdir(path.join(projectRoot, ".agent-context"));
  await mkdir(path.join(projectRoot, "knowledge"));
  await writeFile(path.join(projectRoot, ".agent-context", "config.json"), JSON.stringify({
    schema_version: 3,
    project_id: "test-project",
    project_name: "Test Project",
    agent: { name: "Agent Context OS", mode: "thin-launcher", version: "0.2.0", source: "." },
    memory: {
      sources: [{
        id: "project-vault",
        provider: "obsidian",
        path: "knowledge",
        required_frontmatter: ["id", "type", "status", "summary"]
      }],
      local_index: { provider: "embedded-json", path: ".agent-context/local-index", git_tracked: false }
    },
    quality: { check_command: "scripts/check-agent.ps1", validation_commands: ["node --test"] }
  }), "utf8");
  await writeFile(path.join(projectRoot, "knowledge", "checkout.md"), `---
id: business-checkout
type: business_rule
status: current
summary: 结账前必须校验库存。
tags: [订单, 库存]
---
# 结账

创建订单前检查可售库存，并记录 [[库存决策]]。
`, "utf8");

  const { config } = await loadProjectConfig(projectRoot);
  const built = await buildIndex(config, projectRoot);
  assert.equal(built.index.documents.length, 1);
  assert.equal(built.index.issues.length, 0);
  assert.match(await readFile(built.indexPath, "utf8"), /business-checkout/);

  const loaded = await loadIndex(config, projectRoot);
  const results = searchIndex(loaded.index, "订单 库存", { status: "current" });
  assert.equal(results.length, 1);
  assert.equal(results[0].id, "business-checkout");
  assert.equal(results[0].evidence, "project-vault:checkout.md");
});

test("rejects duplicate knowledge ids across sources", async (context) => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-duplicate-"));
  context.after(() => rm(projectRoot, { recursive: true, force: true }));
  await mkdir(path.join(projectRoot, ".agent-context"));
  await mkdir(path.join(projectRoot, "knowledge"));
  const note = "---\nid: duplicate\ntype: decision\nstatus: current\nsummary: One fact.\n---\n# Fact\n";
  await writeFile(path.join(projectRoot, "knowledge", "one.md"), note, "utf8");
  await writeFile(path.join(projectRoot, "knowledge", "two.md"), note, "utf8");
  const config = {
    project_id: "duplicate-project",
    memory: {
      sources: [{ id: "vault", provider: "obsidian", path: "knowledge" }],
      local_index: { path: ".agent-context/local-index", git_tracked: false }
    }
  };

  await assert.rejects(() => buildIndex(config, projectRoot), /duplicate memory document id/);
});

test("indexes legacy JSONL source path wildcards", async (context) => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-jsonl-"));
  context.after(() => rm(projectRoot, { recursive: true, force: true }));
  await mkdir(path.join(projectRoot, ".agent-context", "memory-sources"), { recursive: true });
  await writeFile(path.join(projectRoot, ".agent-context", "memory-sources", "memory-one.jsonl"),
    '{"id":"legacy-one","type":"decision","status":"current","summary":"Keep legacy sources searchable."}\n', "utf8");
  await writeFile(path.join(projectRoot, ".agent-context", "memory-sources", "_example.jsonl.example"),
    '{"id":"example","summary":"Must not match."}\n', "utf8");
  const config = {
    project_id: "legacy-project",
    memory: {
      source_paths: [".agent-context/memory-sources/memory-*.jsonl"],
      local_index: { path: ".agent-context/local-index", git_tracked: false }
    }
  };

  const built = await buildIndex(config, projectRoot);
  assert.equal(built.index.documents.length, 1);
  assert.equal(built.index.documents[0].id, "legacy-one");
  assert.equal(built.index.documents[0].path, ".agent-context/memory-sources/memory-one.jsonl");
});

test("rejects source issues without replacing an existing index", async (context) => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-preserve-index-"));
  context.after(() => rm(projectRoot, { recursive: true, force: true }));
  await mkdir(path.join(projectRoot, ".agent-context", "local-index"), { recursive: true });
  await mkdir(path.join(projectRoot, "knowledge"));
  const indexPath = path.join(projectRoot, ".agent-context", "local-index", "index.json");
  const previousIndex = '{"documents":[{"id":"known-good"}]}\n';
  await writeFile(indexPath, previousIndex, "utf8");
  await writeFile(path.join(projectRoot, "knowledge", "invalid.md"), "# Missing metadata\n", "utf8");
  const config = {
    project_id: "preserve-index",
    memory: {
      sources: [{ id: "vault", provider: "obsidian", path: "knowledge" }],
      local_index: { provider: "embedded-json", path: ".agent-context/local-index", git_tracked: false }
    }
  };

  await assert.rejects(() => buildIndex(config, projectRoot), /memory source validation failed/);
  assert.equal(await readFile(indexPath, "utf8"), previousIndex);
});

test("validateProject rejects a missing Vault", async (context) => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-missing-vault-"));
  context.after(() => rm(projectRoot, { recursive: true, force: true }));
  const config = {
    project_id: "missing-vault",
    memory: {
      sources: [{ id: "vault", provider: "obsidian", path: "missing" }],
      local_index: { provider: "embedded-json", path: ".agent-context/local-index", git_tracked: false }
    }
  };

  await assert.rejects(() => validateProject(config, projectRoot), /Obsidian vault not found/);
});

test("validateProject rejects an empty knowledge source", async (context) => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-empty-vault-"));
  context.after(() => rm(projectRoot, { recursive: true, force: true }));
  await mkdir(path.join(projectRoot, "knowledge"));
  const config = {
    project_id: "empty-vault",
    memory: {
      sources: [{ id: "vault", provider: "obsidian", path: "knowledge" }],
      local_index: { provider: "embedded-json", path: ".agent-context/local-index", git_tracked: false }
    }
  };

  await assert.rejects(() => validateProject(config, projectRoot), /did not produce any knowledge documents/);
});

test("rejects invalid and sensitive legacy JSONL records", async (context) => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-jsonl-schema-"));
  context.after(() => rm(projectRoot, { recursive: true, force: true }));
  await mkdir(path.join(projectRoot, ".agent-context", "memory-sources"), { recursive: true });
  await writeFile(path.join(projectRoot, ".agent-context", "memory-sources", "memory-invalid.jsonl"), [
    JSON.stringify({ id: "invalid", type: "invented", status: "confirmed", summary: "" }),
    JSON.stringify({ id: "sensitive", type: "decision", status: "current", summary: "Production token value is abc123" })
  ].join("\n"), "utf8");
  const config = {
    project_id: "jsonl-schema",
    memory: {
      source_paths: [".agent-context/memory-sources/memory-*.jsonl"],
      local_index: { provider: "embedded-json", path: ".agent-context/local-index", git_tracked: false }
    }
  };

  await assert.rejects(
    () => buildIndex(config, projectRoot),
    (error) => error.message.includes("unsupported value 'invented'") && error.message.includes("sensitive marker")
  );
});

test("allows knowledge about Token cost without treating it as a credential", async (context) => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-token-cost-"));
  context.after(() => rm(projectRoot, { recursive: true, force: true }));
  await mkdir(path.join(projectRoot, ".agent-context", "memory-sources"), { recursive: true });
  await writeFile(path.join(projectRoot, ".agent-context", "memory-sources", "memory-cost.jsonl"),
    '{"id":"token-cost","type":"architecture_rule","status":"current","summary":"Control Token cost by loading context on demand."}\n', "utf8");
  const config = {
    project_id: "token-cost",
    memory: {
      source_paths: [".agent-context/memory-sources/memory-*.jsonl"],
      local_index: { provider: "embedded-json", path: ".agent-context/local-index", git_tracked: false }
    }
  };

  const built = await buildIndex(config, projectRoot);
  assert.equal(built.index.documents[0].id, "token-cost");
});

test("rejects an index from another project, Agent version or changed source", async (context) => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-index-contract-"));
  context.after(() => rm(projectRoot, { recursive: true, force: true }));
  await mkdir(path.join(projectRoot, ".agent-context", "memory-sources"), { recursive: true });
  const memoryPath = path.join(projectRoot, ".agent-context", "memory-sources", "memory-one.jsonl");
  await writeFile(memoryPath,
    '{"id":"one","type":"decision","status":"current","summary":"First fact."}\n', "utf8");
  const memory = {
    source_paths: [".agent-context/memory-sources/memory-*.jsonl"],
    local_index: { provider: "embedded-json", path: ".agent-context/local-index", git_tracked: false }
  };
  const config = { project_id: "project-one", memory };
  const built = await buildIndex(config, projectRoot);

  await assert.rejects(() => loadIndex({ project_id: "project-two", memory }, projectRoot), /belongs to project/);

  const wrongVersion = { ...built.index, agent_version: "999.0.0" };
  await writeFile(built.indexPath, JSON.stringify(wrongVersion), "utf8");
  await assert.rejects(() => loadIndex(config, projectRoot), /Agent version does not match/);

  await writeFile(built.indexPath, JSON.stringify(built.index), "utf8");
  await writeFile(memoryPath,
    '{"id":"two","type":"decision","status":"current","summary":"Replacement fact."}\n', "utf8");
  const validation = await validateProject(config, projectRoot);
  await assert.rejects(
    () => loadIndex(config, projectRoot, { sourceHash: validation.sourceHash }),
    /local index is stale/
  );

  const invalidDocument = { ...built.index, documents: [{ id: "broken" }] };
  await writeFile(built.indexPath, JSON.stringify(invalidDocument), "utf8");
  await assert.rejects(() => loadIndex(config, projectRoot), /local index document 0 has invalid 'source_id'/);
});
