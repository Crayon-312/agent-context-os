import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parseMarkdown } from "../frontmatter.js";

const DEFAULT_EXCLUDES = [".obsidian", ".git", ".trash"];
const DEFAULT_REQUIRED_FRONTMATTER = ["id", "type", "status", "summary"];
const MEMORY_TYPES = new Set([
  "project_fact",
  "business_rule",
  "interaction_rule",
  "architecture_rule",
  "implementation_note",
  "known_issue",
  "decision",
  "open_question"
]);
const MEMORY_STATUSES = new Set(["current", "draft", "assumption", "stale", "deprecated"]);
const CONFIDENCE_LEVELS = new Set(["high", "medium", "low"]);

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
    const requiredFields = unique([...DEFAULT_REQUIRED_FRONTMATTER, ...(source.required_frontmatter ?? [])]);
    const documentIssues = validateAttributes(attributes, requiredFields);
    if (documentIssues.length > 0) {
      issues.push(...documentIssues.map((issue) => `${source.id}:${relativePath} ${issue}`));
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
  const summary = stringValue(attributes.summary);
  const id = stringValue(attributes.id);

  return {
    id,
    source_id: source.id,
    provider: "obsidian",
    path: relativePath,
    title,
    summary,
    type: stringValue(attributes.type),
    status: stringValue(attributes.status),
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

function validateAttributes(attributes, requiredFields) {
  const issues = [];
  for (const field of requiredFields) {
    if (!isNonEmptyString(attributes[field])) issues.push(`frontmatter '${field}' must be a non-empty string`);
  }

  validateEnum(attributes.type, "type", MEMORY_TYPES, issues);
  validateEnum(attributes.status, "status", MEMORY_STATUSES, issues);
  if (attributes.confidence !== undefined) validateEnum(attributes.confidence, "confidence", CONFIDENCE_LEVELS, issues);
  if (attributes.last_verified !== undefined && !isValidDate(attributes.last_verified)) {
    issues.push("frontmatter 'last_verified' must be a valid YYYY-MM-DD date");
  }
  for (const field of ["scope", "tags"]) {
    if (attributes[field] !== undefined &&
        (!Array.isArray(attributes[field]) || attributes[field].length === 0 ||
         attributes[field].some((item) => !isNonEmptyString(item)))) {
      issues.push(`frontmatter '${field}' must be a non-empty array of non-empty strings`);
    }
  }
  if (attributes.title !== undefined && !isNonEmptyString(attributes.title)) {
    issues.push("frontmatter 'title' must be a non-empty string");
  }
  return issues;
}

function validateEnum(value, field, allowed, issues) {
  if (value !== undefined && (!isNonEmptyString(value) || !allowed.has(value))) {
    issues.push(`frontmatter '${field}' has unsupported value '${String(value)}'`);
  }
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
