// Tests for scripts/agents-md-lint.js — the repo-local replacement for the
// removed @bcai/ai-resources-cli `tools linter/agents-md-lint` command.
//
// Run with: node --test scripts/agents-md-lint.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintAgentsMd, MAX_SIZE_BYTES, REQUIRED_SECTIONS } from './agents-md-lint.js';

const VALID_CONTENT = [
  '# AGENTS.md — Example',
  '',
  '## Project / Scope',
  'Describes the project.',
  '',
  '## Non-Negotiable Constraints',
  'Rules that must not be broken.',
  '',
  '## Build, Run & Test',
  'npm test',
  '',
  '## Security & Safety',
  'Do not commit secrets.',
  '',
  '## Agent Operating Rules',
  'Read the README first.',
  '',
].join('\n');

test('passes a well-formed AGENTS.md with all required sections under the size limit', () => {
  const errors = lintAgentsMd(VALID_CONTENT);
  assert.deepEqual(errors, []);
});

test('flags every missing required section by name', () => {
  const content = '# Some Doc\n\nNo relevant sections here.\n';
  const errors = lintAgentsMd(content);

  assert.equal(errors.length, REQUIRED_SECTIONS.length);
  for (const section of REQUIRED_SECTIONS) {
    assert.ok(
      errors.some((e) => e.includes(section.name)),
      `expected an error mentioning "${section.name}"`
    );
  }
});

test('flags content that exceeds the 8KB size limit', () => {
  const oversized = VALID_CONTENT + 'x'.repeat(MAX_SIZE_BYTES);
  const errors = lintAgentsMd(oversized);

  assert.ok(errors.some((e) => e.includes('exceeds size limit')));
});

test('accepts numbered section headers as a variant of the plain header', () => {
  const content = VALID_CONTENT.replace('## Project / Scope', '## 1. Project / Scope');
  const errors = lintAgentsMd(content);
  assert.deepEqual(errors, []);
});

test('rejects look-alike headings that merely start with a required word', () => {
  // Adversarial case: headings that share a prefix with a required section
  // pattern but are NOT the real section (e.g. "Build vs Buy Analysis" is not
  // "Build, Run & Test"). A prefix-only regex match would incorrectly accept
  // these as satisfying the required-section rule.
  const content = [
    '# Some Doc',
    '',
    '## Project / Scope',
    'x',
    '',
    '## Non-Negotiable Constraints',
    'x',
    '',
    '## Build vs Buy Analysis',
    'x',
    '',
    '## Security Deposit Refund Policy',
    'x',
    '',
    '## Agent Operating Systems We Support',
    'x',
    '',
  ].join('\n');

  const errors = lintAgentsMd(content);

  assert.ok(
    errors.some((e) => e.includes('Build, Run & Test')),
    'expected missing "Build, Run & Test" to be reported despite the "Build vs Buy Analysis" look-alike heading'
  );
  assert.ok(
    errors.some((e) => e.includes('Security & Safety')),
    'expected missing "Security & Safety" to be reported despite the "Security Deposit Refund Policy" look-alike heading'
  );
  assert.ok(
    errors.some((e) => e.includes('Agent Operating Rules')),
    'expected missing "Agent Operating Rules" to be reported despite the "Agent Operating Systems We Support" look-alike heading'
  );
});
