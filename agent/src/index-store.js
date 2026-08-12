import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { getMemorySources, resolveProjectPath } from "./config.js";
import { readJsonlSource } from "./providers/jsonl.js";
import { readObsidianSource } from "./providers/obsidian.js";
import { AGENT_VERSION } from "./version.js";

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
    if (result.documents.length === 0 && result.issues.length === 0) {
      issues.push(`${source.id} did not produce any knowledge documents`);
    }
    sources.push({ id: source.id, provider: source.provider, path: result.sourcePath, document_count: result.documents.length });
  }

  assertUniqueIds(documents);
  if (issues.length > 0) {
    throw new Error(`memory source validation failed:\n- ${issues.join("\n- ")}`);
  }

  const sourceHash = createSourceHash(documents, sources);
  return { documents, sources, indexPath, sourceHash };
}

export async function buildIndex(config, projectRoot) {
  const { documents, sources, indexPath, sourceHash } = await validateProject(config, projectRoot);
  const index = {
    schema_version: 1,
    agent_version: AGENT_VERSION,
    project_id: config.project_id,
    built_at: new Date().toISOString(),
    source_hash: sourceHash,
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

export async function loadIndex(config, projectRoot, options = {}) {
  const indexPath = getIndexPath(config, projectRoot);
  let index;
  try {
    index = JSON.parse(await readFile(indexPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`local index not found; run 'index' first: ${indexPath}`);
    if (error instanceof SyntaxError) throw new Error(`local index is invalid: ${indexPath}`);
    throw error;
  }
  validateIndex(index, config, options.sourceHash);
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

function validateIndex(index, config, sourceHash) {
  if (!index || typeof index !== "object" || Array.isArray(index)) throw new Error("local index root must be an object");
  if (index.schema_version !== 1) throw new Error(`local index schema is unsupported: ${String(index.schema_version)}`);
  if (index.agent_version !== AGENT_VERSION) {
    throw new Error(`local index Agent version does not match; run 'index' again`);
  }
  if (index.project_id !== config.project_id) {
    throw new Error(`local index belongs to project '${String(index.project_id)}', not '${config.project_id}'`);
  }
  if (!Array.isArray(index.documents) || !Array.isArray(index.sources)) {
    throw new Error("local index is missing documents or sources");
  }
  if (typeof index.source_hash !== "string" || !/^[a-f0-9]{64}$/.test(index.source_hash)) {
    throw new Error("local index source hash is invalid; run 'index' again");
  }
  for (const [position, document] of index.documents.entries()) {
    validateIndexDocument(document, position);
  }
  assertUniqueIds(index.documents);
  if (sourceHash && index.source_hash !== sourceHash) {
    throw new Error("local index is stale; project knowledge changed, run 'index' again");
  }
}

function validateIndexDocument(document, position) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error(`local index document ${position} must be an object`);
  }
  for (const field of ["id", "source_id", "path", "title", "summary", "type", "status", "content"]) {
    if (typeof document[field] !== "string" || document[field].trim() === "") {
      throw new Error(`local index document ${position} has invalid '${field}'`);
    }
  }
  for (const field of ["scope", "tags", "links"]) {
    if (!Array.isArray(document[field]) || document[field].some((item) => typeof item !== "string")) {
      throw new Error(`local index document ${position} has invalid '${field}'`);
    }
  }
}

function createSourceHash(documents, sources) {
  const payload = {
    sources: sources.map(({ id, provider, path, document_count }) => ({ id, provider, path, document_count })),
    documents: documents.map(({ id, source_id, path, content_hash }) => ({ id, source_id, path, content_hash }))
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
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
