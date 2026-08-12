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

  return { config, configPath, projectRoot: root };
}

export function validateConfig(config) {
  const issues = [];
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return ["root must be an object"];
  }

  for (const field of ["schema_version", "project_id", "project_name", "engine", "memory"]) {
    if (config[field] === undefined || config[field] === null || config[field] === "") {
      issues.push(`missing field '${field}'`);
    }
  }

  if (config.engine?.mode !== "thin-launcher") {
    issues.push("engine.mode must be 'thin-launcher'");
  }

  const sources = config.memory?.sources;
  const legacyPaths = config.memory?.source_paths;
  if ((!Array.isArray(sources) || sources.length === 0) &&
      (!Array.isArray(legacyPaths) || legacyPaths.length === 0)) {
    issues.push("memory.sources or memory.source_paths must contain at least one source");
  }

  const ids = new Set();
  for (const [index, source] of (sources ?? []).entries()) {
    const prefix = `memory.sources[${index}]`;
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      issues.push(`${prefix} must be an object`);
      continue;
    }
    for (const field of ["id", "provider", "path"]) {
      if (typeof source[field] !== "string" || source[field].trim() === "") {
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
  }

  const localIndex = config.memory?.local_index;
  if (!localIndex || typeof localIndex !== "object") {
    issues.push("memory.local_index must be an object");
  } else {
    if (typeof localIndex.path !== "string" || localIndex.path.trim() === "") {
      issues.push("memory.local_index.path must be a non-empty string");
    }
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
