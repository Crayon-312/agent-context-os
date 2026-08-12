import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parseMarkdown } from "../frontmatter.js";

const DEFAULT_EXCLUDES = [".obsidian", ".git", ".trash"];

export async function readObsidianSource(source, projectRoot) {
  const vaultPath = path.isAbsolute(source.path) ? path.normalize(source.path) : path.resolve(projectRoot, source.path);
  const vaultStat = await stat(vaultPath).catch(() => null);
  if (!vaultStat?.isDirectory()) {
    throw new Error(`Obsidian vault not found: ${vaultPath}`);
  }

  const excluded = new Set([...DEFAULT_EXCLUDES, ...(source.exclude_directories ?? [])]);
  const files = await collectMarkdownFiles(vaultPath, vaultPath, excluded);
  const documents = [];
  const issues = [];

  for (const filePath of files) {
    const relativePath = normalizePath(path.relative(vaultPath, filePath));
    const markdown = await readFile(filePath, "utf8");
    const { attributes, body } = parseMarkdown(markdown);
    const missing = (source.required_frontmatter ?? []).filter((field) => attributes[field] === undefined);
    if (missing.length > 0) {
      issues.push(`${source.id}:${relativePath} missing frontmatter: ${missing.join(", ")}`);
      continue;
    }

    documents.push(toDocument(source, relativePath, markdown, attributes, body));
  }

  return { documents, issues, sourcePath: vaultPath };
}

async function collectMarkdownFiles(root, current, excluded) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isSymbolicLink()) continue;
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      if (!excluded.has(entry.name)) files.push(...await collectMarkdownFiles(root, fullPath, excluded));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push(fullPath);
    }
  }
  return files;
}

function toDocument(source, relativePath, markdown, attributes, body) {
  const title = stringValue(attributes.title) || firstHeading(body) || path.basename(relativePath, path.extname(relativePath));
  const tags = unique([...arrayValue(attributes.tags), ...extractInlineTags(body)]);
  const links = unique(extractWikiLinks(body));
  const summary = stringValue(attributes.summary) || firstParagraph(body);
  const id = stringValue(attributes.id) || `${source.id}:${relativePath}`;

  return {
    id,
    source_id: source.id,
    provider: "obsidian",
    path: relativePath,
    title,
    summary,
    type: stringValue(attributes.type) || "note",
    status: stringValue(attributes.status) || "current",
    scope: arrayValue(attributes.scope),
    tags,
    links,
    confidence: stringValue(attributes.confidence) || null,
    last_verified: stringValue(attributes.last_verified) || null,
    content: body.trim(),
    content_hash: createHash("sha256").update(markdown).digest("hex")
  };
}

function firstHeading(body) {
  return body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "";
}

function firstParagraph(body) {
  return body
    .split(/\n\s*\n/)
    .map((block) => block.replace(/^#+\s+/gm, "").trim())
    .find((block) => block && !block.startsWith("```")) ?? "";
}

function extractWikiLinks(body) {
  return [...body.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)]
    .map((match) => match[1].trim());
}

function extractInlineTags(body) {
  return [...body.matchAll(/(^|\s)#([\p{L}\p{N}_/-]+)/gu)].map((match) => match[2]);
}

function arrayValue(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (value === undefined || value === null || value === "") return [];
  return [String(value).trim()];
}

function stringValue(value) {
  if (value === undefined || value === null || Array.isArray(value)) return "";
  return String(value).trim();
}

function unique(values) {
  return [...new Set(values)];
}

function normalizePath(value) {
  return value.split(path.sep).join("/");
}
