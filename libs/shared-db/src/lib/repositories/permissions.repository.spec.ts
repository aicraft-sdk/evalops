/**
 * Proves `PermissionsRepository.deleteRoleWithDependents` routes all 5 writes through the
 * transaction-scoped `tx` client on the production (non-dev-mode) code path, never through the
 * ambient `db` singleton. A re-hunt of commit e127435 found the only existing regression test
 * (`ee/rbac-custom-roles/src/lib/custom-roles.service.spec.ts`) sets `EVALOPS_DEV_MODE=1`, so it
 * only ever exercises the sequential dev-mode branch — deleting the `db.transaction()` wrapper
 * entirely still left all 8 of those tests passing. This test targets the OTHER (production)
 * branch and would fail if a future edit swapped any `tx.*` call back to `db.*`.
 *
 * Real-Postgres rollback/atomicity proof is explicitly out of scope here and is not currently
 * scheduled in any phase of this plan (Phase 7 covers license-gating end-to-end proof for
 * sso/audit-export/pr-decoration only, not role-deletion transaction rollback) — this only
 * proves the production branch is exercised and every write goes through the `tx` handed into
 * the `db.transaction(...)` callback, via a mocked `db` module.
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

/**
 * Same doubt-verify-driven precedent as `deleteRoleWithDependents` above, applied to the two
 * OTHER unwrapped multi-statement write sequences found in the same phase's final doubt-verify
 * pass: `CustomRolesService.update()` (updateRole + replaceRolePermissions — the more severe gap,
 * capable of silently wiping an EXISTING role's permissions to zero) and `create()` (createRole +
 * getOrCreatePermission×N + replaceRolePermissions — a milder orphan-role gap). Both are proven
 * here to route every write through the transaction-scoped `tx` client on the production
 * (non-dev-mode) branch, never through the ambient `db` singleton.
 */
describe('PermissionsRepository.updateRoleWithPermissions / createRoleWithPermissions (production/non-dev-mode branch)', () => {
  const originalDevMode = process.env['EVALOPS_DEV_MODE'];

  afterEach(() => {
    if (originalDevMode === undefined) {
      delete process.env['EVALOPS_DEV_MODE'];
    } else {
      process.env['EVALOPS_DEV_MODE'] = originalDevMode;
    }
    jest.resetModules();
  });

  function mockTxAndDb() {
    const mockTx = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]), // no pre-existing permission -> forces create path
      returning: jest.fn().mockResolvedValue([{ id: 'role-1' }]),
    };
    const mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
      returning: jest.fn().mockResolvedValue([{ id: 'role-1' }]),
      transaction: jest.fn((cb: (tx: typeof mockTx) => unknown) => cb(mockTx)),
    };
    return { mockTx, mockDb };
  }

  it('updateRoleWithPermissions routes updateRole + replaceRolePermissions through tx, never the ambient db singleton', async () => {
    jest.resetModules();
    delete process.env['EVALOPS_DEV_MODE'];

    const { mockTx, mockDb } = mockTxAndDb();
    jest.doMock('../db', () => ({ db: mockDb }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const { PermissionsRepository } = require('./permissions.repository');
    const repo = new PermissionsRepository();

    const result = await repo.updateRoleWithPermissions(
      'role-1',
      { name: 'Renamed' },
      ['perm-a', 'perm-b'],
    );

    expect(result).toEqual({ id: 'role-1' });
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockDb.delete).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
    // updateRole's UPDATE
    expect(mockTx.update).toHaveBeenCalledTimes(1);
    // replaceRolePermissions' DELETE then INSERT
    expect(mockTx.delete).toHaveBeenCalledTimes(1);
    expect(mockTx.insert).toHaveBeenCalledTimes(1);
  });

  it('updateRoleWithPermissions skips the replace step (and stays inside tx) when no permissionIds are given', async () => {
    jest.resetModules();
    delete process.env['EVALOPS_DEV_MODE'];

    const { mockTx, mockDb } = mockTxAndDb();
    jest.doMock('../db', () => ({ db: mockDb }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const { PermissionsRepository } = require('./permissions.repository');
    const repo = new PermissionsRepository();

    await repo.updateRoleWithPermissions('role-1', { name: 'Renamed' }, undefined);

    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(mockTx.update).toHaveBeenCalledTimes(1);
    expect(mockTx.delete).not.toHaveBeenCalled();
    expect(mockTx.insert).not.toHaveBeenCalled();
  });

  it('createRoleWithPermissions routes createRole + getOrCreatePermission + replaceRolePermissions through tx, never the ambient db singleton', async () => {
    jest.resetModules();
    delete process.env['EVALOPS_DEV_MODE'];

    const { mockTx, mockDb } = mockTxAndDb();
    jest.doMock('../db', () => ({ db: mockDb }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const { PermissionsRepository } = require('./permissions.repository');
    const repo = new PermissionsRepository();

    const roleData = { name: 'Auditor', organizationId: 'org-1', isSystemRole: false, priority: 0 };
    const result = await repo.createRoleWithPermissions(roleData, [
      { resourceType: 'run', action: 'read' },
    ]);

    expect(result).toEqual({ id: 'role-1' });
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockDb.select).not.toHaveBeenCalled();
    // role insert, permission lookup, permission create (limit() forces the create branch), role-permission insert
    expect(mockTx.insert).toHaveBeenCalledTimes(3);
    expect(mockTx.select).toHaveBeenCalledTimes(1);
  });
});
