import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { getMemorySources, resolveProjectPath } from "./config.js";
import { readJsonlSource } from "./providers/jsonl.js";
import { readObsidianSource } from "./providers/obsidian.js";

const PROVIDERS = {
  jsonl: readJsonlSource,
  obsidian: readObsidianSource
};

export async function buildIndex(config, projectRoot) {
  const documents = [];
  const issues = [];
  const sources = [];

  for (const source of getMemorySources(config)) {
    const reader = PROVIDERS[source.provider];
    if (!reader) throw new Error(`unsupported memory provider: ${source.provider}`);
    const result = await reader(source, projectRoot);
    documents.push(...result.documents);
    issues.push(...result.issues);
    sources.push({ id: source.id, provider: source.provider, path: result.sourcePath, document_count: result.documents.length });
  }

  assertUniqueIds(documents);
  const index = {
    schema_version: 1,
    engine_version: "0.1.0",
    project_id: config.project_id,
    built_at: new Date().toISOString(),
    sources,
    issues,
    documents
  };

  const indexPath = getIndexPath(config, projectRoot);
  await mkdir(path.dirname(indexPath), { recursive: true });
  const temporaryPath = `${indexPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  await rename(temporaryPath, indexPath);
  return { index, indexPath };
}

export async function loadIndex(config, projectRoot) {
  const indexPath = getIndexPath(config, projectRoot);
  let index;
  try {
    index = JSON.parse(await readFile(indexPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`local index not found; run 'index' first: ${indexPath}`);
    if (error instanceof SyntaxError) throw new Error(`local index is invalid: ${indexPath}`);
    throw error;
  }
  return { index, indexPath };
}

export function getIndexPath(config, projectRoot) {
  const configuredPath = resolveProjectPath(projectRoot, config.memory.local_index.path);
  return path.extname(configuredPath) ? configuredPath : path.join(configuredPath, "index.json");
}

function assertUniqueIds(documents) {
  const seen = new Set();
  for (const document of documents) {
    if (seen.has(document.id)) throw new Error(`duplicate memory document id: ${document.id}`);
    seen.add(document.id);
  }
}
