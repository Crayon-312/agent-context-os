import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runCli } from "../engine/src/cli.js";

test("validate command rejects a configured source that cannot be read", async (context) => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "agent-context-cli-validate-"));
  context.after(() => rm(projectRoot, { recursive: true, force: true }));
  await mkdir(path.join(projectRoot, ".agent-context"));
  await writeFile(path.join(projectRoot, ".agent-context", "config.json"), JSON.stringify({
    schema_version: 2,
    project_id: "cli-review",
    project_name: "CLI Review",
    engine: { name: "Agent Context OS", mode: "thin-launcher", version: "0.1.0", source: "." },
    memory: {
      sources: [{ id: "vault", provider: "obsidian", path: "missing" }],
      local_index: { provider: "embedded-json", path: ".agent-context/local-index", git_tracked: false }
    }
  }), "utf8");

  const output = [];
  await assert.rejects(
    () => runCli(["validate", "--project", projectRoot, "--json"], {
      stdout: (value) => output.push(value),
      stderr: (value) => output.push(value)
    }),
    /Obsidian vault not found/
  );
  assert.deepEqual(output, []);
});
