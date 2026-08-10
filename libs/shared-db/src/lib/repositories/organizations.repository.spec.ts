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
import type { organizations } from '../schema';

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

describe('OrganizationsRepository.update (dev-mode SQLite)', () => {
  it('never lets a caller-supplied id/createdAt override the row identity/creation time, and always sets updatedAt server-side', async () => {
    const sqliteDb = getSqliteDb();
    const realOrgId = 'real-org-id';
    const originalCreatedAt = new Date('2000-01-01T00:00:00.000Z');
    const repo = new OrganizationsRepository();

    // Seed via the repository's own (dev-mode-safe) create path — matches
    // the explicit id/createdAt pattern already used by AuthService.register
    // — rather than a raw INSERT, so the row's shape matches exactly what a
    // real write through this repository produces.
    await repo.create({
      id: realOrgId,
      name: 'Real Org',
      createdAt: originalCreatedAt,
    } as typeof organizations.$inferInsert);

    // Simulates an admin-update request body that (via a spoofed/bypassed
    // DTO) still carries id/createdAt/updatedAt alongside the legitimate
    // `name` change — mirrors the injection closed for POST /organizations.
    const attackerSuppliedId = 'attacker-controlled-id';
    const attackerSuppliedTimestamp = new Date('1999-01-01T00:00:00.000Z');
    const result = await repo.update(realOrgId, {
      id: attackerSuppliedId,
      createdAt: attackerSuppliedTimestamp,
      updatedAt: attackerSuppliedTimestamp,
      name: 'Renamed Real Org',
    } as Partial<typeof organizations.$inferSelect>);

    // The real row's identity must never change.
    expect(result?.id).toBe(realOrgId);
    // The legitimate field change must still apply.
    expect(result?.name).toBe('Renamed Real Org');

    // Assert the persisted row directly via raw SQL (not the ORM-mapped
    // `.returning()` object) — this dev-mode SQLite connection reuses the
    // Postgres-declared `organizations` table's timestamp columns verbatim
    // (see dev-runtime's sqlite-db.ts), which is known not to round-trip
    // `RETURNING` timestamp values back into JS `Date`s cleanly. Reading the
    // actual stored column values is the ground truth for what was written.
    const [rawRow] = sqliteDb.$client
      .prepare(
        'SELECT id, created_at as createdAt, updated_at as updatedAt FROM organizations WHERE id = ?',
      )
      .all(realOrgId) as { id: string; createdAt: string; updatedAt: string }[];

    // createdAt must never be overridable by the caller.
    expect(new Date(rawRow.createdAt).getTime()).toBe(
      originalCreatedAt.getTime(),
    );
    // updatedAt must be set server-side, never the caller-supplied value.
    expect(new Date(rawRow.updatedAt).getTime()).not.toBe(
      attackerSuppliedTimestamp.getTime(),
    );

    // No row was created/renamed under the attacker-supplied id.
    const hijacked = sqliteDb.$client
      .prepare('SELECT * FROM organizations WHERE id = ?')
      .all(attackerSuppliedId);
    expect(hijacked).toEqual([]);

    // The real row is still addressable under its real id.
    const stillReal = sqliteDb.$client
      .prepare('SELECT * FROM organizations WHERE id = ?')
      .all(realOrgId);
    expect(stillReal).toHaveLength(1);
  });
});

afterAll(() => {
  _resetSqliteDb();
  rmSync(tmpDir, { recursive: true, force: true });
});
