import { readFile } from "node:fs/promises";
import path from "node:path";

export const CONFIG_PATH = ".agent-context/config.json";

export async function loadProjectConfig(projectRoot) {
  const root = path.resolve(projectRoot);
  const configPath = path.join(root, CONFIG_PATH);
  let config;

  try {
    config = JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`configuration not found: ${configPath}`);
    }
    if (error instanceof SyntaxError) {
      throw new Error(`configuration is not valid JSON: ${configPath}`);
    }
    throw error;
  }

  const issues = validateConfig(config);
  if (issues.length > 0) {
    throw new Error(`invalid configuration:\n- ${issues.join("\n- ")}`);
  }

  return { config: normalizeConfig(config), configPath, projectRoot: root };
}

export function validateConfig(config) {
  const issues = [];
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return ["root must be an object"];
  }

  if (!Number.isInteger(config.schema_version) || ![1, 2, 3].includes(config.schema_version)) {
    issues.push("schema_version must be 1, 2 or 3");
  }
  for (const field of ["project_id", "project_name"]) {
    if (!isNonEmptyString(config[field])) issues.push(`${field} must be a non-empty string`);
  }

  const descriptorName = config.schema_version === 3 ? "agent" : "engine";
  const descriptor = config[descriptorName];
  if (!isObject(descriptor)) {
    issues.push(`${descriptorName} must be an object`);
  } else {
    for (const field of ["name", "mode", "version", "source"]) {
      if (!isNonEmptyString(descriptor[field])) issues.push(`${descriptorName}.${field} must be a non-empty string`);
    }
    if (descriptor.mode !== "thin-launcher") issues.push(`${descriptorName}.mode must be 'thin-launcher'`);
  }
  if (config.schema_version === 3 && config.engine !== undefined) issues.push("schema_version 3 must use 'agent', not 'engine'");
  if ([1, 2].includes(config.schema_version) && config.agent !== undefined) issues.push("schema_version 1/2 must use legacy 'engine'");

  if (!isObject(config.memory)) {
    issues.push("memory must be an object");
    return issues;
  }
  const sources = config.memory?.sources;
  const legacyPaths = config.memory?.source_paths;
  if (sources !== undefined && !Array.isArray(sources)) {
    issues.push("memory.sources must be an array");
  }
  if (legacyPaths !== undefined && !Array.isArray(legacyPaths)) {
    issues.push("memory.source_paths must be an array");
  }
  if (Array.isArray(sources) && sources.length > 0 && Array.isArray(legacyPaths) && legacyPaths.length > 0) {
    issues.push("memory.sources and memory.source_paths must not both be configured");
  }
  if ((!Array.isArray(sources) || sources.length === 0) &&
      (!Array.isArray(legacyPaths) || legacyPaths.length === 0)) {
    issues.push("memory.sources or memory.source_paths must contain at least one source");
  }

  for (const [index, sourcePath] of (Array.isArray(legacyPaths) ? legacyPaths : []).entries()) {
    if (!isNonEmptyString(sourcePath)) issues.push(`memory.source_paths[${index}] must be a non-empty string`);
  }

  const ids = new Set();
  for (const [index, source] of (Array.isArray(sources) ? sources : []).entries()) {
    const prefix = `memory.sources[${index}]`;
    if (!isObject(source)) {
      issues.push(`${prefix} must be an object`);
      continue;
    }
    for (const field of ["id", "provider", "path"]) {
      if (!isNonEmptyString(source[field])) {
        issues.push(`${prefix}.${field} must be a non-empty string`);
      }
    }
    if (source.id && ids.has(source.id)) {
      issues.push(`${prefix}.id must be unique`);
    }
    ids.add(source.id);
    if (source.provider && source.provider !== "obsidian" && source.provider !== "jsonl") {
      issues.push(`${prefix}.provider '${source.provider}' is not supported`);
    }
    if (source.provider === "obsidian") {
      validateStringArray(source.required_frontmatter, `${prefix}.required_frontmatter`, issues, { optional: true });
      validateStringArray(source.exclude_directories, `${prefix}.exclude_directories`, issues, { optional: true });
    }
  }

  const localIndex = config.memory?.local_index;
  if (!isObject(localIndex)) {
    issues.push("memory.local_index must be an object");
  } else {
    if (localIndex.provider !== "embedded-json") issues.push("memory.local_index.provider must be 'embedded-json'");
    if (!isNonEmptyString(localIndex.path)) issues.push("memory.local_index.path must be a non-empty string");
    if (localIndex.git_tracked !== false) {
      issues.push("memory.local_index.git_tracked must be false");
    }
  }

  return issues;
}

export function getMemorySources(config) {
  if (Array.isArray(config.memory.sources) && config.memory.sources.length > 0) {
    return config.memory.sources;
  }

  return config.memory.source_paths.map((sourcePath, index) => ({
    id: `legacy-jsonl-${index + 1}`,
    provider: "jsonl",
    path: sourcePath
  }));
}

export function resolveProjectPath(projectRoot, targetPath) {
  return path.isAbsolute(targetPath) ? path.normalize(targetPath) : path.resolve(projectRoot, targetPath);
}

function normalizeConfig(config) {
  if (config.schema_version === 3) return config;
  const { engine, ...rest } = config;
  return { ...rest, agent: engine };
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function validateStringArray(value, field, issues, { optional = false } = {}) {
  if (value === undefined && optional) return;
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => !isNonEmptyString(item))) {
    issues.push(`${field} must be a non-empty array of non-empty strings`);
  }
}
