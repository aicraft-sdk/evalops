/**
 * Compile-time proof that RunsRepository.createPolicyViolation() rejects
 * unknown fields now that it is typed from `typeof policyViolations.$inferSelect`
 * instead of `Record<string, unknown>` + `as any`.
 *
 * Before the fix, `data: Record<string, unknown>` accepted (and Drizzle
 * silently dropped) any key that was not a real `policy_violations` column —
 * the exact class of bug that caused the `policyScore` silent-data-loss
 * incident already fixed on update()/updateStatus()/completeRun() in this
 * same file. This test does not perform any database I/O; ts-jest
 * type-checks it on every run (no `isolatedModules`), so a
 * `@ts-expect-error` line that stops producing a compiler error makes this
 * test suite fail — proving the type safety is real, not just a comment.
 */
import { RunsRepository } from './runs.repository';

describe('RunsRepository.createPolicyViolation() — compile-time field safety', () => {
  it('accepts a real policy_violations payload (all required columns) on createPolicyViolation()', () => {
    const repository = new RunsRepository();
    // Real required columns only — must type-check with no error.
    const call = () =>
      repository.createPolicyViolation({
        runId: 'run-1',
        policyId: 'policy-1',
        ruleIndex: 0,
        severity: 'fail',
        message: 'violated rule',
        organizationId: 'org-1',
      });
    expect(typeof call).toBe('function');
  });

  it('accepts the optional evidence column alongside required columns', () => {
    const repository = new RunsRepository();
    const call = () =>
      repository.createPolicyViolation({
        runId: 'run-1',
        policyId: 'policy-1',
        ruleIndex: 0,
        severity: 'fail',
        message: 'violated rule',
        evidence: { detail: 'x' },
        organizationId: 'org-1',
      });
    expect(typeof call).toBe('function');
  });

  it('rejects an unknown field on createPolicyViolation() at compile time', () => {
    const repository = new RunsRepository();
    const call = () =>
      repository.createPolicyViolation({
        runId: 'run-1',
        policyId: 'policy-1',
        ruleIndex: 0,
        severity: 'fail',
        message: 'violated rule',
        organizationId: 'org-1',
        // @ts-expect-error `notARealPolicyViolationColumn` does not exist on
        // the policy_violations table — this must fail to compile. Pre-fix
        // (Record<string, unknown> + `as any`) this line compiled cleanly
        // and the field was silently dropped at runtime.
        notARealPolicyViolationColumn: 'x',
      });
    expect(typeof call).toBe('function');
  });

  it('rejects a call missing a required column at compile time', () => {
    const repository = new RunsRepository();
    const call = () =>
      // @ts-expect-error `policyId` is required and missing here.
      repository.createPolicyViolation({
        runId: 'run-1',
        ruleIndex: 0,
        severity: 'fail',
        message: 'violated rule',
        organizationId: 'org-1',
      });
    expect(typeof call).toBe('function');
  });
});
