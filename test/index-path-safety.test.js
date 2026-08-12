import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { validateProject } from "../engine/src/index-store.js";

const execFileAsync = promisify(execFile);

test("rejects a repository-local index path that is not ignored", async (context) => {
  const root = await createGitProject(context, "index.json");
  await assert.rejects(() => validateProject(projectConfig("index.json"), root), /not ignored by Git/);
});

test("rejects an index path already tracked by Git", async (context) => {
  const root = await createGitProject(context, "index.json");
  await writeFile(path.join(root, "index.json"), "{}\n", "utf8");
  await execFileAsync("git", ["-C", root, "add", "index.json"]);
  await assert.rejects(() => validateProject(projectConfig("index.json"), root), /tracked by Git/);
});

test("accepts an ignored repository-local index path", async (context) => {
  const root = await createGitProject(context, ".agent-context/local-index");
  await writeFile(path.join(root, ".gitignore"), ".agent-context/local-index/\n", "utf8");
  const result = await validateProject(projectConfig(".agent-context/local-index"), root);
  assert.equal(result.documents.length, 1);
});

async function createGitProject(context) {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-context-index-safety-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await execFileAsync("git", ["init", "--quiet", root]);
  await mkdir(path.join(root, "knowledge"));
  await writeFile(path.join(root, "knowledge", "fact.md"), `---
id: fact
type: project_fact
status: current
summary: A valid fact.
---
# Fact
`, "utf8");
  return root;
}

function projectConfig(indexPath) {
  return {
    project_id: "index-safety",
    memory: {
      sources: [{ id: "vault", provider: "obsidian", path: "knowledge" }],
      local_index: { provider: "embedded-json", path: indexPath, git_tracked: false }
    }
  };
}
