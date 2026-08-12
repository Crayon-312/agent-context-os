import assert from "node:assert/strict";
import test from "node:test";
import { parseMarkdown } from "../agent/src/frontmatter.js";

test("parses supported frontmatter values and preserves body", () => {
  const markdown = `---
id: memory-auth
status: current
tags: [auth, "user flow"]
scope:
  - api
  - web
enabled: true
---
# Authentication

Users sign in before opening the dashboard.
`;

  const result = parseMarkdown(markdown);
  assert.equal(result.attributes.id, "memory-auth");
  assert.equal(result.attributes.enabled, true);
  assert.deepEqual(result.attributes.tags, ["auth", "user flow"]);
  assert.deepEqual(result.attributes.scope, ["api", "web"]);
  assert.match(result.body, /# Authentication/);
});

test("treats markdown without a complete frontmatter block as body", () => {
  const markdown = "---\ntitle: Incomplete\n# Body";
  assert.deepEqual(parseMarkdown(markdown), { attributes: {}, body: markdown });
});
