import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { validateMemoryRecord } from "../memory-schema.js";

export async function readJsonlSource(source, projectRoot) {
  const documents = [];
  const issues = [];
  const sourcePaths = await resolveSourcePaths(source.path, projectRoot);
  if (sourcePaths.length === 0) {
    throw new Error(`JSONL source did not match any file: ${source.path}`);
  }

  for (const sourcePath of sourcePaths) {
    const relativePath = normalizePath(path.relative(projectRoot, sourcePath));
    const content = await readFile(sourcePath, "utf8");
    for (const [index, line] of content.split(/\r?\n/).entries()) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line);
        const recordIssues = validateMemoryRecord(record);
        if (recordIssues.length > 0) {
          issues.push(...recordIssues.map((issue) => `${source.id}:${relativePath}:${index + 1} ${issue}`));
          continue;
        }
        documents.push({
          id: record.id,
          source_id: source.id,
          provider: "jsonl",
          path: relativePath,
          title: record.title ?? record.summary,
          summary: record.summary,
          type: record.type,
          status: record.status,
          scope: record.scope ?? [],
          tags: record.tags ?? [],
          links: [],
          confidence: record.confidence ?? null,
          last_verified: record.last_verified ?? null,
          content: JSON.stringify(record),
          content_hash: createHash("sha256").update(line).digest("hex")
        });
      } catch (error) {
        issues.push(`${source.id}:${relativePath}:${index + 1} invalid JSON: ${error.message}`);
      }
    }
  }

  return { documents, issues, sourcePath: sourcePaths.map(normalizePath).join(",") };
}

async function resolveSourcePaths(configuredPath, projectRoot) {
  const resolvedPath = path.isAbsolute(configuredPath)
    ? path.normalize(configuredPath)
    : path.resolve(projectRoot, configuredPath);
  if (!configuredPath.includes("*")) {
    await readFile(resolvedPath, "utf8").catch((error) => {
      if (error.code === "ENOENT") throw new Error(`JSONL source not found: ${resolvedPath}`);
      throw error;
    });
    return [resolvedPath];
  }

  const directory = path.dirname(resolvedPath);
  const filePattern = path.basename(resolvedPath);
  if (directory.includes("*")) {
    throw new Error(`wildcards are only supported in JSONL file names: ${configuredPath}`);
  }
  const matcher = new RegExp(`^${escapeRegExp(filePattern).replaceAll("*", ".*")}$`, "i");
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  return entries
    .filter((entry) => entry.isFile() && matcher.test(entry.name))
    .map((entry) => path.join(directory, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function normalizePath(value) {
  return value.split(path.sep).join("/");
}
