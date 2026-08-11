/**
 * WS4 — Dogfood EvalOps on itself
 *
 * These tests verify that the Workstream 4 artifacts exist and are well-formed:
 * 1. evalops-self.eval.yaml exists at repo root with 4-8 scenarios
 * 2. package.json has the self-eval script
 * 3. CI has the self-evals job
 * 4. docs/archive/AI_CHANGES.md marks E5 as completed
 */

import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';

// Repo root is 3 levels up from apps/evaluation-service/src/__tests__
const REPO_ROOT = path.resolve(__dirname, '../../../../');

describe('WS4 — Self-Eval Artifacts', () => {
  describe('evalops-self.eval.yaml', () => {
    const specPath = path.join(REPO_ROOT, 'evalops-self.eval.yaml');

    it('file exists at repo root', () => {
      expect(fs.existsSync(specPath)).toBe(true);
    });

    it('is valid YAML', () => {
      const content = fs.readFileSync(specPath, 'utf-8');
      expect(() => yaml.load(content)).not.toThrow();
    });

    it('has a top-level name field', () => {
      const content = fs.readFileSync(specPath, 'utf-8');
      const spec = yaml.load(content) as Record<string, unknown>;
      expect(typeof spec['name']).toBe('string');
      expect((spec['name'] as string).length).toBeGreaterThan(0);
    });

    it('has a scenarios array with 4 to 8 entries', () => {
      const content = fs.readFileSync(specPath, 'utf-8');
      const spec = yaml.load(content) as Record<string, unknown>;
      const scenarios = spec['scenarios'] as unknown[];
      expect(Array.isArray(scenarios)).toBe(true);
      expect(scenarios.length).toBeGreaterThanOrEqual(4);
      expect(scenarios.length).toBeLessThanOrEqual(8);
    });

    it('each scenario has id, name, input, and expected fields', () => {
      const content = fs.readFileSync(specPath, 'utf-8');
      const spec = yaml.load(content) as Record<string, unknown>;
      const scenarios = spec['scenarios'] as Record<string, unknown>[];
      for (const scenario of scenarios) {
        expect(typeof scenario['id']).toBe('string');
        expect(typeof scenario['name']).toBe('string');
        expect(scenario['input']).toBeDefined();
        expect(scenario['expected']).toBeDefined();
      }
    });

    it('covers all four target areas (agentmd, exact, rule, policy)', () => {
      const content = fs.readFileSync(specPath, 'utf-8');
      const spec = yaml.load(content) as Record<string, unknown>;
      const scenarios = spec['scenarios'] as Record<string, unknown>[];
      const targets = scenarios.map((s) => s['target'] as string);
      expect(targets.some((t) => t && t.includes('agent-md'))).toBe(true);
      expect(targets.some((t) => t && t.includes('exact-evaluator'))).toBe(true);
      expect(targets.some((t) => t && t.includes('rule-evaluator'))).toBe(true);
      expect(targets.some((t) => t && t.includes('policy-verdict'))).toBe(true);
    });
  });

  describe('package.json self-eval script', () => {
    const pkgPath = path.join(REPO_ROOT, 'package.json');

    it('has a self-eval script', () => {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      expect(pkg.scripts['self-eval']).toBeDefined();
      expect(typeof pkg.scripts['self-eval']).toBe('string');
    });

    it('self-eval script references run-suite or eval run', () => {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const script: string = pkg.scripts['self-eval'];
      const hasSuiteRef =
        script.includes('run-suite') ||
        script.includes('eval run') ||
        script.includes('evalops');
      expect(hasSuiteRef).toBe(true);
    });
  });

  describe('CI self-evals job', () => {
    const ciPath = path.join(REPO_ROOT, '.github/workflows/ci.yml');

    it('ci.yml contains a self-evals job', () => {
      const content = fs.readFileSync(ciPath, 'utf-8');
      expect(content).toContain('self-evals:');
    });

    it('self-evals job has continue-on-error: false (hardened gate)', () => {
      const content = fs.readFileSync(ciPath, 'utf-8');
      const selfEvalsIdx = content.indexOf('self-evals:');
      expect(selfEvalsIdx).toBeGreaterThan(-1);
      const selfEvalsSection = content.slice(selfEvalsIdx, selfEvalsIdx + 800);
      expect(selfEvalsSection).toContain('continue-on-error: false');
    });

    it('self-evals job needs test or lint', () => {
      const content = fs.readFileSync(ciPath, 'utf-8');
      const selfEvalsIdx = content.indexOf('self-evals:');
      const selfEvalsSection = content.slice(selfEvalsIdx, selfEvalsIdx + 800);
      expect(
        selfEvalsSection.includes('test') || selfEvalsSection.includes('lint')
      ).toBe(true);
    });

    it('self-evals job uses EVALOPS_API_URL and EVALOPS_API_KEY secrets', () => {
      const content = fs.readFileSync(ciPath, 'utf-8');
      const selfEvalsIdx = content.indexOf('self-evals:');
      const selfEvalsSection = content.slice(selfEvalsIdx, selfEvalsIdx + 1000);
      expect(selfEvalsSection).toContain('EVALOPS_API_URL');
      expect(selfEvalsSection).toContain('EVALOPS_API_KEY');
    });
  });

  describe('AI_CHANGES.md E5 status', () => {
    const aiChangesPath = path.join(REPO_ROOT, 'docs/archive/AI_CHANGES.md');

    it('E5 exists as its own section (## E5)', () => {
      const content = fs.readFileSync(aiChangesPath, 'utf-8');
      const e5SectionIdx = content.indexOf('## E5');
      expect(e5SectionIdx).toBeGreaterThan(-1);
    });

    it('E5 section mentions evalops-self.eval.yaml', () => {
      const content = fs.readFileSync(aiChangesPath, 'utf-8');
      const e5Idx = content.indexOf('## E5');
      expect(e5Idx).toBeGreaterThan(-1);
      const e5Section = content.slice(e5Idx, e5Idx + 1500);
      expect(e5Section).toContain('evalops-self.eval.yaml');
    });

    it('E5 section mentions the CI job', () => {
      const content = fs.readFileSync(aiChangesPath, 'utf-8');
      const e5Idx = content.indexOf('## E5');
      expect(e5Idx).toBeGreaterThan(-1);
      const e5Section = content.slice(e5Idx, e5Idx + 1500);
      expect(e5Section).toContain('self-evals');
      expect(e5Section).toContain('✅');
    });

    it('E5 section is marked as completed (contains ✅)', () => {
      const content = fs.readFileSync(aiChangesPath, 'utf-8');
      const e5Idx = content.indexOf('## E5');
      expect(e5Idx).toBeGreaterThan(-1);
      // The section heading or the first 200 chars should contain ✅ completed marker
      const e5Header = content.slice(e5Idx, e5Idx + 200);
      expect(e5Header).toContain('✅');
    });
  });
});
