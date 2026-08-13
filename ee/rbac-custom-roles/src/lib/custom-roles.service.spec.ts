/**
 * `EVALOPS_DEV_MODE` / `EVALOPS_DEV_DB_PATH` must be set BEFORE `@evalops/shared-db`
 * (and anything importing it, including `./custom-roles.service`) is first required —
 * `db.ts` reads them at module-load time. That is why every import below is a deferred
 * `require()` executed only after env vars and the on-disk SQLite schema are prepared,
 * not a static ES `import` (mirrors `organizations.repository.spec.ts`'s established
 * pattern for real dev-mode-SQLite-backed repository tests).
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

process.env['EVALOPS_DEV_MODE'] = '1';

const tmpDir = mkdtempSync(join(tmpdir(), 'custom-roles-service-spec-'));
const dbPath = join(tmpDir, 'test.db');
process.env['EVALOPS_DEV_DB_PATH'] = dbPath;

const Database = require('better-sqlite3');
const rawDb = new Database(dbPath);
rawDb.exec(`
  CREATE TABLE roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    organization_id TEXT NOT NULL,
    is_system_role INTEGER DEFAULT 0,
    priority INTEGER DEFAULT 0,
    created_at TEXT,
    updated_at TEXT
  );
  CREATE TABLE role_permissions (
    id TEXT PRIMARY KEY,
    role_id TEXT NOT NULL,
    permission_id TEXT NOT NULL,
    created_at TEXT
  );
  CREATE TABLE user_roles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    assigned_by TEXT NOT NULL,
    assigned_at TEXT
  );
  CREATE TABLE resource_permissions (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    role_id TEXT,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    action TEXT NOT NULL,
    granted INTEGER NOT NULL DEFAULT 1,
    granted_by TEXT NOT NULL,
    expires_at TEXT,
    created_at TEXT
  );
  CREATE TABLE permission_audit_log (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    user_id TEXT,
    target_user_id TEXT,
    resource_type TEXT,
    resource_id TEXT,
    permission TEXT,
    role_id TEXT,
    details TEXT,
    performed_by TEXT NOT NULL,
    created_at TEXT
  );
  -- Simulates a genuine mid-sequence write failure on a specific role's
  -- resource_permissions rows (e.g. a business-rule trigger, a lock, a
  -- constraint) WITHOUT touching any other test's schema/data - only DELETEs
  -- targeting this one poisoned role_id abort.
  CREATE TRIGGER poison_resource_permissions_delete
  BEFORE DELETE ON resource_permissions
  WHEN OLD.role_id = 'role-mid-txn-failure'
  BEGIN
    SELECT RAISE(ABORT, 'simulated mid-transaction failure clearing resource_permissions');
  END;
`);
// rawDb stays open for the lifetime of this file - used both to seed fixture
// rows and to independently verify real DB state after each repository call
// (below, closed only in afterAll).

const { ForbiddenException } = require('@nestjs/common');
const { CustomRolesService } = require('./custom-roles.service');
const { PermissionsRepository } = require('@evalops/shared-db');
const { getSqliteDb, _resetSqliteDb } = require('@evalops/dev-runtime');

function seedRole(id: string, overrides: Partial<{ organizationId: string; isSystemRole: number }> = {}) {
  rawDb
    .prepare(
      `INSERT INTO roles (id, name, description, organization_id, is_system_role, priority, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?, 0, ?, ?)`,
    )
    .run(
      id,
      `Role ${id}`,
      overrides.organizationId ?? 'org-1',
      overrides.isSystemRole ?? 0,
      new Date().toISOString(),
      new Date().toISOString(),
    );
}

function seedRolePermission(roleId: string, id: string) {
  rawDb
    .prepare(`INSERT INTO role_permissions (id, role_id, permission_id, created_at) VALUES (?, ?, ?, ?)`)
    .run(id, roleId, `perm-${id}`, new Date().toISOString());
}

function seedUserRole(roleId: string, id: string) {
  rawDb
    .prepare(
      `INSERT INTO user_roles (id, user_id, role_id, assigned_by, assigned_at) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(id, `user-${id}`, roleId, `admin-${id}`, new Date().toISOString());
}

function seedResourcePermission(roleId: string, id: string) {
  rawDb
    .prepare(
      `INSERT INTO resource_permissions
        (id, user_id, role_id, resource_type, resource_id, action, granted, granted_by, created_at)
       VALUES (?, NULL, ?, 'dataset', 'res-1', 'read', 1, 'admin-1', ?)`,
    )
    .run(id, roleId, new Date().toISOString());
}

function seedAuditLog(roleId: string, id: string) {
  rawDb
    .prepare(
      `INSERT INTO permission_audit_log
        (id, action, user_id, target_user_id, resource_type, resource_id, permission, role_id, details, performed_by, created_at)
       VALUES (?, 'role_assigned', NULL, NULL, NULL, NULL, NULL, ?, NULL, 'admin-1', ?)`,
    )
    .run(id, roleId, new Date().toISOString());
}

describe('CustomRolesService', () => {
  it('rejects updating a system role', async () => {
    const repo = {
      findRoleById: jest.fn().mockResolvedValue({ id: 'r1', isSystemRole: true, organizationId: 'org-1' }),
      updateRole: jest.fn(),
    };
    const service = new CustomRolesService(repo as never);
    await expect(service.update('org-1', 'r1', { name: 'Hacked Admin' })).rejects.toThrow(ForbiddenException);
    expect(repo.updateRole).not.toHaveBeenCalled();
  });

  it('rejects deleting a system role', async () => {
    const repo = {
      findRoleById: jest.fn().mockResolvedValue({ id: 'r1', isSystemRole: true, organizationId: 'org-1' }),
      deleteRoleWithDependents: jest.fn(),
    };
    const service = new CustomRolesService(repo as never);
    await expect(service.remove('org-1', 'r1')).rejects.toThrow(ForbiddenException);
    expect(repo.deleteRoleWithDependents).not.toHaveBeenCalled();
  });

  it("rejects cross-org access to another org's role", async () => {
    const repo = { findRoleById: jest.fn().mockResolvedValue({ id: 'r1', isSystemRole: false, organizationId: 'org-OTHER' }) };
    const service = new CustomRolesService(repo as never);
    await expect(service.remove('org-1', 'r1')).rejects.toThrow(ForbiddenException);
  });

  it('creates a custom role with isSystemRole explicitly false', async () => {
    const repo = {
      createRole: jest.fn().mockResolvedValue({ id: 'r2' }),
      getOrCreatePermission: jest.fn().mockResolvedValue({ id: 'perm-1' }),
      replaceRolePermissions: jest.fn(),
    };
    const service = new CustomRolesService(repo as never);
    await service.create('org-1', { name: 'Auditor', permissions: [{ resourceType: 'run', action: 'read' }] });
    expect(repo.createRole).toHaveBeenCalledWith(expect.objectContaining({ isSystemRole: false, organizationId: 'org-1' }));
  });

  it('deletes a role by delegating the entire FK-dependent cleanup + delete sequence to a single transactional repository call', async () => {
    const repo = {
      findRoleById: jest.fn().mockResolvedValue({ id: 'r1', isSystemRole: false, organizationId: 'org-1' }),
      deleteRoleWithDependents: jest.fn().mockResolvedValue(true),
      // Legacy per-step methods intentionally omitted here: remove() must not call any of
      // them directly now that deleteRoleWithDependents owns the whole FK-safe sequence
      // inside one transaction - calling any of them would throw "not a function" and fail
      // this test.
    };
    const service = new CustomRolesService(repo as never);

    await expect(service.remove('org-1', 'r1')).resolves.toBe(true);

    expect(repo.deleteRoleWithDependents).toHaveBeenCalledWith('r1');
    expect(repo.deleteRoleWithDependents).toHaveBeenCalledTimes(1);
  });
});

describe('PermissionsRepository.deleteRoleWithDependents (dev-mode SQLite, real DB, no mocks)', () => {
  it('does not delete the role when an intermediate dependent-clearing step throws mid-sequence', async () => {
    const roleId = 'role-mid-txn-failure';
    seedRole(roleId);
    seedRolePermission(roleId, 'rp-fail-1');
    seedUserRole(roleId, 'ur-fail-1');
    seedResourcePermission(roleId, 'rsp-fail-1'); // matches the poison trigger's WHEN clause

    const repo = new PermissionsRepository();

    await expect(repo.deleteRoleWithDependents(roleId)).rejects.toThrow(
      'simulated mid-transaction failure clearing resource_permissions',
    );

    const stillThere = rawDb.prepare('SELECT * FROM roles WHERE id = ?').all(roleId);
    expect(stillThere).toHaveLength(1);
  });

  it('clears role_permissions/user_roles/resource_permissions and deletes the role on the happy path', async () => {
    const roleId = 'role-happy-path';
    seedRole(roleId);
    seedRolePermission(roleId, 'rp-happy-1');
    seedUserRole(roleId, 'ur-happy-1');
    seedResourcePermission(roleId, 'rsp-happy-1');

    const repo = new PermissionsRepository();

    await expect(repo.deleteRoleWithDependents(roleId)).resolves.toBe(true);

    expect(rawDb.prepare('SELECT * FROM roles WHERE id = ?').all(roleId)).toEqual([]);
    expect(rawDb.prepare('SELECT * FROM role_permissions WHERE role_id = ?').all(roleId)).toEqual([]);
    expect(rawDb.prepare('SELECT * FROM user_roles WHERE role_id = ?').all(roleId)).toEqual([]);
    expect(rawDb.prepare('SELECT * FROM resource_permissions WHERE role_id = ?').all(roleId)).toEqual([]);
  });

  it('detaches (nulls role_id on) permission_audit_log rows instead of deleting them, preserving audit history', async () => {
    const roleId = 'role-audit-log';
    seedRole(roleId);
    seedAuditLog(roleId, 'log-1');

    const repo = new PermissionsRepository();

    await expect(repo.deleteRoleWithDependents(roleId)).resolves.toBe(true);

    const rows = rawDb.prepare('SELECT * FROM permission_audit_log WHERE id = ?').all('log-1');
    expect(rows).toHaveLength(1);
    expect(rows[0].role_id).toBeNull();
  });
});

afterAll(() => {
  rawDb.close();
  _resetSqliteDb();
  rmSync(tmpDir, { recursive: true, force: true });
});
