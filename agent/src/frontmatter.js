const FRONTMATTER_BOUNDARY = "---";

export function parseMarkdown(markdown) {
  const normalized = markdown.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!normalized.startsWith(`${FRONTMATTER_BOUNDARY}\n`)) {
    return { attributes: {}, body: normalized };
  }

  const end = normalized.indexOf(`\n${FRONTMATTER_BOUNDARY}\n`, FRONTMATTER_BOUNDARY.length + 1);
  if (end === -1) {
    return { attributes: {}, body: normalized };
  }

  const raw = normalized.slice(FRONTMATTER_BOUNDARY.length + 1, end);
  const body = normalized.slice(end + FRONTMATTER_BOUNDARY.length + 2);
  return { attributes: parseSimpleYaml(raw), body };
}

export function parseSimpleYaml(raw) {
  const result = {};
  let activeList = null;

  for (const sourceLine of raw.split("\n")) {
    const line = sourceLine.trimEnd();
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;

    const listMatch = line.match(/^\s+-\s+(.+)$/);
    if (listMatch && activeList) {
      result[activeList].push(parseScalar(listMatch[1]));
      continue;
    }

    const fieldMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!fieldMatch) {
      activeList = null;
      continue;
    }

    const [, key, rawValue] = fieldMatch;
    if (rawValue === "") {
      result[key] = [];
      activeList = key;
    } else {
      result[key] = parseScalar(rawValue);
      activeList = null;
    }
  }

  return result;
}

function parseScalar(rawValue) {
  const value = rawValue.trim();
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    return splitInlineList(value.slice(1, -1)).map(parseScalar);
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;
  return value;
}

function splitInlineList(value) {
  const items = [];
  let quote = null;
  let current = "";
  for (const character of value) {
    if ((character === '"' || character === "'") && (!quote || quote === character)) {
      quote = quote ? null : character;
      current += character;
    } else if (character === "," && !quote) {
      items.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  if (current.trim()) items.push(current.trim());
  return items;
}
