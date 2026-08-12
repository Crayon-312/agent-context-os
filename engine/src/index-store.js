import { execFile } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { getMemorySources, resolveProjectPath } from "./config.js";
import { readJsonlSource } from "./providers/jsonl.js";
import { readObsidianSource } from "./providers/obsidian.js";

const PROVIDERS = {
  jsonl: readJsonlSource,
  obsidian: readObsidianSource
};
const execFileAsync = promisify(execFile);

export async function validateProject(config, projectRoot) {
  const indexPath = getIndexPath(config, projectRoot);
  await assertIndexPathProtected(indexPath, projectRoot);
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
  if (issues.length > 0) {
    throw new Error(`memory source validation failed:\n- ${issues.join("\n- ")}`);
  }

  return { documents, sources, indexPath };
}

export async function buildIndex(config, projectRoot) {
  const { documents, sources, indexPath } = await validateProject(config, projectRoot);
  const index = {
    schema_version: 1,
    engine_version: "0.1.0",
    project_id: config.project_id,
    built_at: new Date().toISOString(),
    sources,
    issues: [],
    documents
  };

  await mkdir(path.dirname(indexPath), { recursive: true });
  const temporaryPath = `${indexPath}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
    await rename(temporaryPath, indexPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
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

async function assertIndexPathProtected(indexPath, projectRoot) {
  const repositoryRoot = await getRepositoryRoot(projectRoot);
  if (!repositoryRoot || !isWithin(repositoryRoot, indexPath)) return;

  const relativePath = path.relative(repositoryRoot, indexPath).split(path.sep).join("/");
  if (await gitSucceeds(repositoryRoot, ["ls-files", "--error-unmatch", "--", relativePath])) {
    throw new Error(`local index path is tracked by Git: ${indexPath}`);
  }
  if (!await gitSucceeds(repositoryRoot, ["check-ignore", "--quiet", "--no-index", "--", relativePath])) {
    throw new Error(`local index path is not ignored by Git: ${indexPath}`);
  }
}

async function getRepositoryRoot(projectRoot) {
  try {
    const { stdout } = await execFileAsync("git", ["-C", projectRoot, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
    return path.resolve(stdout.trim());
  } catch {
    return null;
  }
}

async function gitSucceeds(repositoryRoot, args) {
  try {
    await execFileAsync("git", ["-C", repositoryRoot, ...args]);
    return true;
  } catch {
    return false;
  }
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}
