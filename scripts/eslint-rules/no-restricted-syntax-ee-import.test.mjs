// Tests for the compensating `no-restricted-syntax` ESLint rule in eslint.config.mjs that
// flags require()/eval()/dynamic-import() calls targeting ee/* paths or @evalops/ee-* packages
// — the manual fallback for CommonJS/dynamic escape hatches around
// @nx/enforce-module-boundaries' scope:enterprise constraint, which only inspects static
// import/import() AST nodes (see ee/README.md "Known limitation" section).
//
// Uses a real eslint `Linter.verify()` probe against the actual rule config exported from
// eslint.config.mjs (not a copy), so this test breaks if the real selectors regress or drift.
//
// Run with: node --test scripts/eslint-rules/no-restricted-syntax-ee-import.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Linter } from 'eslint';
import config from '../../eslint.config.mjs';

const restrictedSyntaxBlock = config.find(
  (block) =>
    Array.isArray(block.files) &&
    block.files.includes('src/**/*.ts') &&
    block.rules?.['no-restricted-syntax']
);

assert.ok(
  restrictedSyntaxBlock,
  'expected eslint.config.mjs to contain the no-restricted-syntax compensating-control block'
);

const linter = new Linter({ configType: 'flat' });

function flagsCode(code) {
  const messages = linter.verify(code, {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: { 'no-restricted-syntax': restrictedSyntaxBlock.rules['no-restricted-syntax'] },
  });
  return messages.some((m) => m.ruleId === 'no-restricted-syntax');
}

// --- Pre-existing Literal-node coverage (regression guard — must stay caught) ---

test('flags require() of an ee/* path via a plain string literal', () => {
  assert.equal(flagsCode("require('ee/sso');"), true);
});

test('flags eval("require")(...) of an ee/* path via a plain string literal', () => {
  assert.equal(flagsCode("eval('require')('ee/sso');"), true);
});

test('flags dynamic import() of an ee/* path via a plain string literal', () => {
  assert.equal(flagsCode("import('ee/sso');"), true);
});

// --- Template-literal bypass (the gap being closed) ---

test('flags require() of an ee/* path via a zero-interpolation template literal', () => {
  assert.equal(flagsCode('require(`ee/sso`);'), true);
});

test('flags dynamic import() of an ee/* path via a zero-interpolation template literal', () => {
  assert.equal(flagsCode('import(`ee/sso`);'), true);
});

test('flags require() of an @evalops/ee-* package via a zero-interpolation template literal', () => {
  assert.equal(flagsCode('require(`@evalops/ee-sso`);'), true);
});

// --- No false positives on unrelated code ---

test('does not flag require() of an unrelated string literal', () => {
  assert.equal(flagsCode("require('lodash');"), false);
});

test('does not flag require() of an unrelated zero-interpolation template literal', () => {
  assert.equal(flagsCode('require(`lodash`);'), false);
});

test('does not flag a template literal WITH interpolation (still a genuinely open gap, not a false positive to fix here)', () => {
  assert.equal(flagsCode('const p = "sso"; require(`ee/${p}`);'), false);
});
