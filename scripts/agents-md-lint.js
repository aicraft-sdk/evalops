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
 * Strip fenced code-block regions from markdown content before heading
 * detection. Without this, a heading-lookalike string inside an "example
 * format" code fence (e.g. documenting what a section header looks like)
 * would satisfy the heading-presence regex even though it isn't a real
 * heading. Each stripped fence line is replaced with a blank line so line
 * numbers/positions of surrounding content are otherwise unaffected.
 *
 * Handles both CommonMark fence delimiters — ``` and ~~~ — as first-class,
 * tracked independently: a ``` fence and a ~~~ fence do NOT close each
 * other. The currently-open fence remembers which delimiter character
 * opened it (openFenceChar); only a marker line using that same character
 * closes it. A marker line using the other character while a fence is open
 * is just fence content (still stripped, doesn't toggle state). This mirrors
 * CommonMark semantics without a single shared boolean that either
 * delimiter could incorrectly toggle.
 */
export function stripFencedCodeBlocks(content) {
  const lines = content.split('\n');
  const result = [];
  let openFenceChar = null; // '`' or '~' while inside a fence, null otherwise

  for (const line of lines) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    const markerChar = fenceMatch ? fenceMatch[1][0] : null;

    if (openFenceChar === null && markerChar !== null) {
      // Opens a new fence; remember which delimiter character must close it.
      openFenceChar = markerChar;
      result.push('');
      continue;
    }

    if (openFenceChar !== null && markerChar === openFenceChar) {
      // Only the same delimiter character closes the currently-open fence.
      openFenceChar = null;
      result.push('');
      continue;
    }

    result.push(openFenceChar !== null ? '' : line);
  }

  return result.join('\n');
}

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

  // Size check operates on the ORIGINAL unmodified content — stripping fences
  // must only affect heading detection, not the real file size limit.
  const byteLength = Buffer.byteLength(content, 'utf8');
  if (byteLength > MAX_SIZE_BYTES) {
    errors.push(`exceeds size limit (${byteLength} bytes > ${MAX_SIZE_BYTES} bytes)`);
  }

  const contentForHeadingCheck = stripFencedCodeBlocks(content);

  for (const section of REQUIRED_SECTIONS) {
    if (!hasRequiredSection(contentForHeadingCheck, section)) {
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
