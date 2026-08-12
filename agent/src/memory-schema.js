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
const SENSITIVE_FIELD_NAMES = new Set([
  "api_key", "apikey", "token", "access_token", "refresh_token", "secret", "password",
  "passwd", "pwd", "credential", "credentials", "private_key", "cookie", "session_id"
]);
const SENSITIVE_VALUE_PATTERNS = [
  /\b(?:api[_-]?key|token|access[_-]?token|refresh[_-]?token|secret|password|passwd|pwd|credential|private[_-]?key|cookie|session[_-]?id)\b\s*(?:(?:value\s*)?(?:is|=|:))\s*["']?(?!<|\*|redacted\b|example\b)[^\s,"'}]{4,}/i,
  /(?:账号|密码|密钥|凭据|私钥|访问令牌|刷新令牌)\s*(?:是|为|=|：|:)\s*(?!<|\*|已脱敏|示例)\S{4,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bBearer\s+[A-Za-z0-9._~+/-]{8,}={0,2}\b/i,
  /\b(?:sk|ghp|github_pat)_[A-Za-z0-9_-]{8,}\b/
];

export const CORE_MEMORY_FIELDS = ["id", "type", "status", "summary"];

export function validateMemoryRecord(record, options = {}) {
  const issues = [];
  if (!record || typeof record !== "object" || Array.isArray(record)) return ["record must be an object"];

  const requiredFields = unique([...CORE_MEMORY_FIELDS, ...(options.requiredFields ?? [])]);
  for (const field of requiredFields) {
    if (!isNonEmptyString(record[field])) issues.push(`'${field}' must be a non-empty string`);
  }

  validateEnum(record.type, "type", MEMORY_TYPES, issues);
  validateEnum(record.status, "status", MEMORY_STATUSES, issues);
  if (record.confidence !== undefined && record.confidence !== null) {
    validateEnum(record.confidence, "confidence", CONFIDENCE_LEVELS, issues);
  }
  if (record.last_verified !== undefined && record.last_verified !== null && !isValidDate(record.last_verified)) {
    issues.push("'last_verified' must be a valid YYYY-MM-DD date");
  }
  for (const field of ["scope", "tags"]) {
    if (record[field] !== undefined &&
        (!Array.isArray(record[field]) || record[field].length === 0 ||
         record[field].some((item) => !isNonEmptyString(item)))) {
      issues.push(`'${field}' must be a non-empty array of non-empty strings`);
    }
  }
  if (record.title !== undefined && !isNonEmptyString(record.title)) {
    issues.push("'title' must be a non-empty string");
  }
  if (containsSensitiveRecord(record)) {
    issues.push("contains a sensitive marker");
  }
  return issues;
}

export function containsSensitiveText(value) {
  return SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(String(value)));
}

function containsSensitiveRecord(value) {
  if (typeof value === "string") return containsSensitiveText(value);
  if (Array.isArray(value)) return value.some(containsSensitiveRecord);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, item]) =>
    SENSITIVE_FIELD_NAMES.has(key.toLowerCase()) || containsSensitiveRecord(item));
}

function validateEnum(value, field, allowed, issues) {
  if (value !== undefined && (!isNonEmptyString(value) || !allowed.has(value))) {
    issues.push(`'${field}' has unsupported value '${String(value)}'`);
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

function unique(values) {
  return [...new Set(values)];
}
