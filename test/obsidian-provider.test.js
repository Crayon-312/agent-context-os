import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readObsidianSource } from "../engine/src/providers/obsidian.js";

test("reads Obsidian notes, links and tags while ignoring editor metadata", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-obsidian-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, ".obsidian"));
  await mkdir(path.join(root, "architecture"));
  await writeFile(path.join(root, ".obsidian", "workspace.md"), "ignored", "utf8");
  await writeFile(path.join(root, "architecture", "engine.md"), `---
id: arch-engine
type: architecture_rule
status: current
scope: [engine]
tags: [architecture]
summary: The Engine owns context routing.
confidence: high
last_verified: 2026-08-12
---
# Engine Boundary

The Engine reads [[Project Knowledge]] and returns evidence. #runtime
`, "utf8");

  const result = await readObsidianSource({
    id: "project-vault",
    provider: "obsidian",
    path: root,
    required_frontmatter: ["id", "type", "status", "summary"]
  }, root);

  assert.equal(result.issues.length, 0);
  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].id, "arch-engine");
  assert.deepEqual(result.documents[0].links, ["Project Knowledge"]);
  assert.deepEqual(result.documents[0].tags, ["architecture", "runtime"]);
  assert.equal(result.documents[0].path, "architecture/engine.md");
});

test("reports notes missing required frontmatter without indexing them", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-obsidian-invalid-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "note.md"), "# Missing metadata\n", "utf8");

  const result = await readObsidianSource({
    id: "project-vault",
    provider: "obsidian",
    path: root,
    required_frontmatter: ["id", "type"]
  }, root);

  assert.equal(result.documents.length, 0);
  assert.deepEqual(result.issues, [
    "project-vault:note.md frontmatter 'id' must be a non-empty string",
    "project-vault:note.md frontmatter 'type' must be a non-empty string",
    "project-vault:note.md frontmatter 'status' must be a non-empty string",
    "project-vault:note.md frontmatter 'summary' must be a non-empty string"
  ]);
});

test("rejects empty and invalid knowledge metadata instead of applying defaults", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-obsidian-schema-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "invalid.md"), `---
id: ""
type: unsupported_type
status: ""
summary: []
scope: module
confidence: certain
last_verified: 2026-02-30
---
# Invalid metadata
`, "utf8");

  const result = await readObsidianSource({
    id: "project-vault",
    provider: "obsidian",
    path: root,
    required_frontmatter: ["id", "type", "status", "summary"]
  }, root);

  assert.equal(result.documents.length, 0);
  assert.ok(result.issues.some((issue) => issue.includes("'id' must be a non-empty string")));
  assert.ok(result.issues.some((issue) => issue.includes("'type' has unsupported value")));
  assert.ok(result.issues.some((issue) => issue.includes("'status' must be a non-empty string")));
  assert.ok(result.issues.some((issue) => issue.includes("'summary' must be a non-empty string")));
  assert.ok(result.issues.some((issue) => issue.includes("'scope' must be a non-empty array")));
  assert.ok(result.issues.some((issue) => issue.includes("'confidence' has unsupported value")));
  assert.ok(result.issues.some((issue) => issue.includes("'last_verified' must be a valid YYYY-MM-DD date")));
});
