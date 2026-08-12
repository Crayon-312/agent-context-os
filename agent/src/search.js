export function searchIndex(index, query, options = {}) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) throw new Error("search query must not be empty");
  const terms = tokenize(normalizedQuery);
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 10;

  return index.documents
    .filter((document) => !options.type || document.type === options.type)
    .filter((document) => !options.status || document.status === options.status)
    .map((document) => ({ document, score: scoreDocument(document, normalizedQuery, terms) }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.document.id.localeCompare(right.document.id))
    .slice(0, limit)
    .map(({ document, score }) => ({
      score,
      id: document.id,
      title: document.title,
      summary: document.summary,
      type: document.type,
      status: document.status,
      tags: document.tags,
      source_id: document.source_id,
      path: document.path,
      evidence: `${document.source_id}:${document.path}`
    }));
}

function scoreDocument(document, query, terms) {
  const title = normalize(document.title);
  const summary = normalize(document.summary);
  const metadata = normalize([
    document.type,
    document.status,
    ...(document.tags ?? []),
    ...(document.scope ?? []),
    ...(document.links ?? [])
  ].join(" "));
  const content = normalize(document.content);
  let score = 0;
  if (title.includes(query)) score += 12;
  if (summary.includes(query)) score += 8;
  if (metadata.includes(query)) score += 6;
  if (content.includes(query)) score += 4;
  for (const term of terms) {
    if (title.includes(term)) score += 4;
    if (summary.includes(term)) score += 3;
    if (metadata.includes(term)) score += 2;
    if (content.includes(term)) score += 1;
  }
  return score;
}

function tokenize(value) {
  const segments = new Intl.Segmenter("zh-CN", { granularity: "word" }).segment(value);
  return [...new Set([...segments].filter((item) => item.isWordLike).map((item) => item.segment).filter((item) => item.length > 1))];
}

function normalize(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase("zh-CN").trim();
}
