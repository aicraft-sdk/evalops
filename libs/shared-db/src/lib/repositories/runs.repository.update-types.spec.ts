/**
 * Compile-time proof that RunsRepository.update()/updateStatus() reject
 * unknown fields now that they are typed as Partial<typeof runs.$inferSelect>
 * instead of Record<string, unknown> + `as any`.
 *
 * Before the fix, `data: Record<string, unknown>` accepted (and Drizzle
 * silently dropped) any key that was not a real `runs` column — this is the
 * exact shape of bug that caused the `policyScore` silent-data-loss
 * incident. This file does not run any database I/O; ts-jest type-checks it
 * on every run (no `isolatedModules`), so a `@ts-expect-error` line that
 * stops producing a compiler error makes this test suite fail — proving the
 * type safety is real, not just a comment.
 */
import { RunsRepository } from './runs.repository';

describe('RunsRepository.update() / updateStatus() — compile-time field safety', () => {
  it('accepts a real runs column on update()', () => {
    const repository = new RunsRepository();
    // Real column — must type-check with no error.
    const call = () => repository.update('run-id', { policyScore: 87 });
    expect(typeof call).toBe('function');
  });

  it('rejects an unknown field on update() at compile time', () => {
    const repository = new RunsRepository();
    // @ts-expect-error `notARealRunsColumn` does not exist on the runs table —
    // this must fail to compile. Pre-fix (Record<string, unknown> + `as any`)
    // this line compiled cleanly and the field was silently dropped at runtime.
    const call = () => repository.update('run-id', { notARealRunsColumn: 'x' });
    expect(typeof call).toBe('function');
  });

  it('rejects an unknown field on updateStatus()-shaped payloads at compile time', () => {
    // updateStatus() takes a plain `status: string`, so the field-safety proof
    // lives in its internal `Partial<typeof runs.$inferSelect>` update object —
    // exercised indirectly via update() above using the same inferred type.
    const repository = new RunsRepository();
    const call = () =>
      // @ts-expect-error `bogusField` is not a runs column.
      repository.update('run-id', { status: 'completed', bogusField: 1 });
    expect(typeof call).toBe('function');
  });
});
