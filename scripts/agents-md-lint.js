#!/usr/bin/env node
// AGENTS.md structural linter — repo-local replacement for the removed
// `npx @bcai/ai-resources-cli tools linter/agents-md-lint` command.
//
// Validates root AGENTS.md against the two rules this repo's own docs
// (AI_CHANGES.md, REVIEW.md, docs/PRESENTATION_DECK.md) document as the
// contract the previous CLI-based linter enforced:
//   - size must stay under the 8 KB limit
//   - the five required section headers must be present
//
// The previous linter's "forbidden path patterns" (/src/, /lib/,
// /components/) and subfolder-override checks are NOT reproduced here —
// nothing in this repo documents those rules concretely, and there are no
// subfolder AGENTS.md files today. Re-add only if a concrete rule surfaces.
//
// Usage:
//   node scripts/agents-md-lint.js
//
// Exit codes:
//   0 - AGENTS.md passes all checks
//   1 - One or more violations found

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_SIZE_BYTES = 8192; // 8 KB

export const REQUIRED_SECTIONS = [
  { name: 'Project / Scope', pattern: 'Project / Scope' },
  { name: 'Non-Negotiable Constraints', pattern: 'Non-Negotiable Constraints' },
  { name: 'Build, Run & Test', pattern: 'Build, Run & Test' },
  { name: 'Security & Safety', pattern: 'Security & Safety' },
  { name: 'Agent Operating Rules', pattern: 'Agent Operating Rules' },
];

/**
 * Check whether `content` has a markdown heading matching `section.pattern`.
 * Matches any heading level and an optional numeric prefix (e.g. "## 1. Build, Run & Test").
 * The pattern must match the FULL canonical section title, not a prefix — this
 * prevents look-alike headings (e.g. "Build vs Buy Analysis" matching "Build")
 * from being counted as satisfying the required section.
 */
export function hasRequiredSection(content, section) {
  const escapedPattern = section.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headerPattern = new RegExp(`^#+\\s+(?:\\d+\\.\\s+)?${escapedPattern}\\s*$`, 'mi');
  return headerPattern.test(content);
}

/**
 * Lint AGENTS.md content. Returns an array of violation messages (empty = pass).
 */
export function lintAgentsMd(content) {
  const errors = [];

  const byteLength = Buffer.byteLength(content, 'utf8');
  if (byteLength > MAX_SIZE_BYTES) {
    errors.push(`exceeds size limit (${byteLength} bytes > ${MAX_SIZE_BYTES} bytes)`);
  }

  for (const section of REQUIRED_SECTIONS) {
    if (!hasRequiredSection(content, section)) {
      errors.push(`missing required section: ${section.name}`);
    }
  }

  return errors;
}

function main() {
  const agentsPath = path.join(process.cwd(), 'AGENTS.md');

  if (!fs.existsSync(agentsPath)) {
    console.error(`AGENTS.md LINT ERROR: ${agentsPath}: file not found`);
    process.exit(1);
  }

  const content = fs.readFileSync(agentsPath, 'utf8');
  const errors = lintAgentsMd(content);

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`AGENTS.md LINT ERROR: ${agentsPath}: ${error}`);
    }
    process.exit(1);
  }

  console.log('AGENTS.md lint passed');
}

const isDirectRun =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  main();
}
