import process from "node:process";
import { loadProjectConfig } from "./config.js";
import { buildIndex, loadIndex, validateProject } from "./index-store.js";
import { searchIndex } from "./search.js";

const HELP = `Agent Context OS\n\nUsage:\n  agent-context validate [--project <path>] [--json]\n  agent-context index [--project <path>] [--json]\n  agent-context search <query> [--project <path>] [--limit <n>] [--type <type>] [--status <status>] [--json]\n`;

export async function runCli(argv, io = defaultIo()) {
  const { command, positionals, options } = parseArguments(argv);
  if (!command || command === "help" || options.help) {
    io.stdout(HELP);
    return 0;
  }

  const projectRoot = options.project ?? process.cwd();
  const { config, configPath, projectRoot: resolvedRoot } = await loadProjectConfig(projectRoot);

  if (command === "validate") {
    const validation = await validateProject(config, resolvedRoot);
    const result = {
      valid: true,
      project_id: config.project_id,
      config_path: configPath,
      documents: validation.documents.length,
      index_path: validation.indexPath,
      sources: validation.sources
    };
    printResult(result, options.json, io,
      `Project context valid: ${config.project_id}\nSources: ${result.sources.length}\nDocuments: ${result.documents}`);
    return 0;
  }

  if (command === "index") {
    const { index, indexPath } = await buildIndex(config, resolvedRoot);
    const result = {
      index_path: indexPath,
      documents: index.documents.length,
      issues: index.issues,
      sources: index.sources
    };
    printResult(result, options.json, io, `Indexed ${result.documents} documents to ${indexPath}\nIssues: ${result.issues.length}`);
    if (result.issues.length > 0) result.issues.forEach((issue) => io.stderr(`- ${issue}\n`));
    return 0;
  }

  if (command === "search") {
    const query = positionals.join(" ").trim();
    const limit = parseLimit(options.limit);
    const validation = await validateProject(config, resolvedRoot);
    const { index } = await loadIndex(config, resolvedRoot, { sourceHash: validation.sourceHash });
    const results = searchIndex(index, query, {
      limit,
      type: options.type,
      status: options.status
    });
    if (options.json) {
      io.stdout(`${JSON.stringify({ query, count: results.length, results }, null, 2)}\n`);
    } else if (results.length === 0) {
      io.stdout("No matching context found.\n");
    } else {
      for (const result of results) {
        io.stdout(`[${result.score}] ${result.title}\n  ${result.evidence}\n  ${result.summary}\n`);
      }
    }
    return 0;
  }

  throw new Error(`unknown command '${command}'\n\n${HELP}`);
}

function parseLimit(value) {
  if (value === undefined) return undefined;
  if (!/^[1-9]\d*$/.test(value)) throw new Error("--limit must be a positive integer");
  const limit = Number(value);
  if (!Number.isSafeInteger(limit)) throw new Error("--limit is too large");
  return limit;
}

function parseArguments(argv) {
  const options = {};
  const positionals = [];
  let command = null;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (!command && !argument.startsWith("-")) {
      command = argument;
    } else if (argument === "--json") {
      options.json = true;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (["--project", "--limit", "--type", "--status"].includes(argument)) {
      const value = argv[++index];
      if (!value) throw new Error(`${argument} requires a value`);
      options[argument.slice(2)] = value;
    } else if (argument.startsWith("-")) {
      throw new Error(`unknown option '${argument}'`);
    } else {
      positionals.push(argument);
    }
  }
  return { command, positionals, options };
}

function printResult(result, json, io, text) {
  io.stdout(json ? `${JSON.stringify(result, null, 2)}\n` : `${text}\n`);
}

function defaultIo() {
  return {
    stdout: (value) => process.stdout.write(value),
    stderr: (value) => process.stderr.write(value)
  };
}
