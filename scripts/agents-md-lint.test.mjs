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

test('rejects headings that only appear inside a fenced code block (no real sections)', () => {
  // Adversarial case: all 5 required heading strings appear verbatim, but only
  // inside a ``` fenced "example format" block. None of them are real headings
  // in the document, so all 5 sections should still be reported as missing.
  const content = [
    '# AGENTS.md',
    '',
    'Example format for reference:',
    '',
    '```',
    '## Project / Scope',
    '## Non-Negotiable Constraints',
    '## Build, Run & Test',
    '## Security & Safety',
    '## Agent Operating Rules',
    '```',
    '',
    'None of the above are real sections - just an example. This file has no actual content.',
    '',
  ].join('\n');

  const errors = lintAgentsMd(content);

  assert.equal(errors.length, REQUIRED_SECTIONS.length);
  for (const section of REQUIRED_SECTIONS) {
    assert.ok(
      errors.some((e) => e.includes(section.name)),
      `expected missing "${section.name}" to be reported despite the fenced-code-block look-alike heading`
    );
  }
});

test('rejects headings that only appear inside a ~~~ fenced code block (tilde-fence bypass)', () => {
  // Adversarial case: CommonMark allows ~~~ as an alternative fence delimiter to
  // ```. A fence-detector that only recognizes backticks would let all 5
  // required heading strings sneak through inside a ~~~ block undetected.
  const content = [
    '# AGENTS.md',
    '',
    'Example format for reference:',
    '',
    '~~~',
    '## Project / Scope',
    '## Non-Negotiable Constraints',
    '## Build, Run & Test',
    '## Security & Safety',
    '## Agent Operating Rules',
    '~~~',
    '',
    'None of the above are real sections - just an example. This file has no actual content.',
    '',
  ].join('\n');

  const errors = lintAgentsMd(content);

  assert.equal(errors.length, REQUIRED_SECTIONS.length);
  for (const section of REQUIRED_SECTIONS) {
    assert.ok(
      errors.some((e) => e.includes(section.name)),
      `expected missing "${section.name}" to be reported despite the ~~~ fenced-code-block look-alike heading`
    );
  }
});

test('accepts a legitimate AGENTS.md with both a ``` block and a ~~~ block, neither containing real headings', () => {
  // Mixed-fence case: a ``` fence and a ~~~ fence do not close each other per
  // CommonMark. Both must be independently stripped, and real headings outside
  // either fence must still be detected.
  const content = [
    '# AGENTS.md',
    '',
    '## Project / Scope',
    'Describes the project. Example directory layout:',
    '',
    '```',
    'apps/',
    '  frontend/',
    '```',
    '',
    '## Non-Negotiable Constraints',
    'Rules that must not be broken.',
    '',
    '## Build, Run & Test',
    'Run the tests with:',
    '',
    '~~~bash',
    'npm test',
    '~~~',
    '',
    '## Security & Safety',
    'Do not commit secrets.',
    '',
    '## Agent Operating Rules',
    'Read the README first.',
    '',
  ].join('\n');

  const errors = lintAgentsMd(content);
  assert.deepEqual(errors, []);
});

test('rejects headings that only appear inside a nested 3-backtick example shown inside a 4-backtick outer fence (fence-length bypass)', () => {
  // Adversarial case: a common, non-adversarial authoring pattern for
  // documenting Markdown fencing itself — a 4-backtick outer fence used to
  // literally display a 3-backtick example. Per CommonMark, only a closing
  // marker with length >= the opening marker's length (4) closes the fence;
  // a 3-backtick line inside is just fence content, not a closer. A linter
  // that checks delimiter CHARACTER only (not length) would wrongly treat
  // the inner 3-backtick line as closing the fence, exposing the heading
  // lookalikes inside as if they were real, unfenced document content.
  const content = [
    '# AGENTS.md',
    '',
    '## Project / Scope',
    'This is the project.',
    '',
    '## Non-Negotiable Constraints',
    'Follow the rules.',
    '',
    "Below is an example of this doc's required section format, shown as literal",
    'markdown text (4-backtick fence so the inner backticks render literally):',
    '',
    '````markdown',
    '```',
    '## Build, Run & Test',
    '## Security & Safety',
    '## Agent Operating Rules',
    '```',
    '````',
    '',
    "That's just the reference template - none of the above are real sections here.",
    '',
  ].join('\n');

  const errors = lintAgentsMd(content);

  assert.equal(errors.length, 3);
  for (const name of ['Build, Run & Test', 'Security & Safety', 'Agent Operating Rules']) {
    assert.ok(
      errors.some((e) => e.includes(name)),
      `expected missing "${name}" to be reported despite the nested-fence look-alike heading`
    );
  }
});

test('closes a fence whose closing marker is longer than its opening marker (3-backtick open, 5-backtick close)', () => {
  // Per CommonMark, the closing fence must be AT LEAST as long as the opening
  // fence — a longer closer is valid and must still close the fence. This
  // must not regress into requiring an EXACT length match.
  const content = [
    '# AGENTS.md',
    '',
    '## Project / Scope',
    'Describes the project. Example:',
    '',
    '```',
    '## Build, Run & Test',
    '## Security & Safety',
    '## Agent Operating Rules',
    '`````',
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

  const errors = lintAgentsMd(content);
  assert.deepEqual(errors, []);
});

test('accepts a legitimate AGENTS.md that has an unrelated code fence elsewhere in the document', () => {
  // The fix must not be so aggressive that it breaks ordinary code examples
  // that don't contain heading-lookalike text.
  const content = [
    '# AGENTS.md',
    '',
    '## Project / Scope',
    'Describes the project.',
    '',
    '## Non-Negotiable Constraints',
    'Rules that must not be broken.',
    '',
    '## Build, Run & Test',
    'Run the tests with:',
    '',
    '```bash',
    'npm test',
    'echo "done"',
    '```',
    '',
    '## Security & Safety',
    'Do not commit secrets.',
    '',
    '## Agent Operating Rules',
    'Read the README first.',
    '',
  ].join('\n');

  const errors = lintAgentsMd(content);
  assert.deepEqual(errors, []);
});
