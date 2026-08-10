/**
 * Real SQLite dev-mode proof that `createWithAdminMember` does not leave an
 * orphaned `organizations` row when the second (membership) insert fails.
 *
 * Dev mode cannot wrap both inserts in one atomic transaction (see the
 * comment on `createWithAdminMember`: drizzle's better-sqlite3 driver only
 * supports synchronous transaction callbacks, while the shared repository
 * code is written async-first for the Postgres path) — so this test proves
 * the fallback behavior instead: on membership-insert failure, the
 * already-inserted org row is explicitly rolled back (deleted), leaving no
 * orphan and no accumulation of unmanageable duplicate-name orgs on retry.
 *
 * EVALOPS_DEV_MODE / EVALOPS_DEV_DB_PATH must be set BEFORE `@evalops/shared-db`
 * (and anything importing it) is first required — db.ts reads these at
 * module-load time. That is why the DB-touching imports are deferred
 * `require()` calls below, executed only after env vars and the on-disk
 * SQLite schema are prepared.
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

process.env['EVALOPS_DEV_MODE'] = '1';

const tmpDir = mkdtempSync(join(tmpdir(), 'evalops-org-repo-spec-'));
const dbPath = join(tmpDir, 'test.db');
process.env['EVALOPS_DEV_DB_PATH'] = dbPath;

const Database = require('better-sqlite3');
const rawDb = new Database(dbPath);
rawDb.exec(`
  CREATE TABLE organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT,
    updated_at TEXT
  );
  CREATE TABLE organization_members (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    created_at TEXT
  );
`);
rawDb.close();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { OrganizationsRepository } = require('./organizations.repository');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getSqliteDb, _resetSqliteDb } = require('@evalops/dev-runtime');

describe('OrganizationsRepository.createWithAdminMember (dev-mode SQLite)', () => {
  afterAll(() => {
    _resetSqliteDb();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('does not leave an orphaned organization row when the admin-membership insert fails', async () => {
    const repo = new OrganizationsRepository();

    // userId=null violates organization_members.user_id NOT NULL, forcing
    // the second insert to fail after the org row has already been written.
    await expect(
      repo.createWithAdminMember({ name: 'Orphan Co' }, null),
    ).rejects.toThrow();

    const sqliteDb = getSqliteDb();
    const orphaned = sqliteDb
      .$client
      .prepare('SELECT * FROM organizations WHERE name = ?')
      .all('Orphan Co');

    expect(orphaned).toEqual([]);
  });
});
