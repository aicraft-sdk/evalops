/**
 * Proves `PermissionsRepository.deleteRoleWithDependents` routes all 5 writes through the
 * transaction-scoped `tx` client on the production (non-dev-mode) code path, never through the
 * ambient `db` singleton. A re-hunt of commit e127435 found the only existing regression test
 * (`ee/rbac-custom-roles/src/lib/custom-roles.service.spec.ts`) sets `EVALOPS_DEV_MODE=1`, so it
 * only ever exercises the sequential dev-mode branch — deleting the `db.transaction()` wrapper
 * entirely still left all 8 of those tests passing. This test targets the OTHER (production)
 * branch and would fail if a future edit swapped any `tx.*` call back to `db.*`.
 *
 * Real-Postgres rollback/atomicity proof is explicitly out of scope here (deferred to Phase 7)
 * — this only proves the production branch is exercised and every write goes through the `tx`
 * handed into the `db.transaction(...)` callback, via a mocked `db` module.
 *
 * `isDevMode` is read once at module load from `process.env['EVALOPS_DEV_MODE']`, so this file
 * forces that env var to a falsy value and dynamically `require()`s the repository AFTER
 * `jest.doMock('../db', ...)`, mirroring the deferred-require-after-env-setup pattern already
 * established in `organizations.repository.spec.ts` / `custom-roles.service.spec.ts` for
 * controlling which dev/prod branch a `shared-db` module resolves to at first load. This also
 * means the test is self-checking: if `isDevMode` were accidentally still true (e.g. the env
 * var reset below were removed or ineffective), `deleteRoleWithDependents` would instead call
 * `db.delete`/`db.update` directly and never call `db.transaction` — both assertions on the
 * ambient `mockDb` below would fail.
 */

describe('PermissionsRepository.deleteRoleWithDependents (production/non-dev-mode branch)', () => {
  const originalDevMode = process.env['EVALOPS_DEV_MODE'];

  afterEach(() => {
    if (originalDevMode === undefined) {
      delete process.env['EVALOPS_DEV_MODE'];
    } else {
      process.env['EVALOPS_DEV_MODE'] = originalDevMode;
    }
    jest.resetModules();
  });

  it('routes all 5 writes (4 deletes + 1 update) through tx, never through the ambient db singleton', async () => {
    jest.resetModules();
    // Force the production branch regardless of the ambient EVALOPS_DEV_MODE the test
    // runner's shell sets for the rest of the suite (this project's mandated verification
    // command is `EVALOPS_DEV_MODE=1 nx test ...`).
    delete process.env['EVALOPS_DEV_MODE'];

    const mockTx = {
      delete: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([{ id: 'role-1' }]),
    };
    const mockDb = {
      delete: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([{ id: 'role-1' }]),
      transaction: jest.fn((cb: (tx: typeof mockTx) => unknown) => cb(mockTx)),
    };

    jest.doMock('../db', () => ({ db: mockDb }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const { PermissionsRepository } = require('./permissions.repository');
    const repo = new PermissionsRepository();

    const result = await repo.deleteRoleWithDependents('role-1');

    expect(result).toBe(true);
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    // The regression this test guards against: any write inside the transaction callback
    // accidentally using the ambient `db` singleton instead of the `tx` it was handed.
    expect(mockDb.delete).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
    // rolePermissions delete, userRoles delete, resourcePermissions delete, roles delete
    expect(mockTx.delete).toHaveBeenCalledTimes(4);
    // permissionAuditLog detach
    expect(mockTx.update).toHaveBeenCalledTimes(1);
  });
});
