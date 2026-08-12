import { isUniqueConstraintViolation } from './dialect-utils';

describe('isUniqueConstraintViolation', () => {
  it('recognizes a REAL better-sqlite3 SQLITE_CONSTRAINT_UNIQUE error (EVALOPS_DEV_MODE driver)', () => {
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    db.exec(
      'CREATE TABLE t (id TEXT PRIMARY KEY, cache_key TEXT UNIQUE NOT NULL)',
    );
    db.prepare('INSERT INTO t (id, cache_key) VALUES (?, ?)').run('1', 'dup');

    let caught: unknown;
    try {
      db.prepare('INSERT INTO t (id, cache_key) VALUES (?, ?)').run(
        '2',
        'dup',
      );
    } catch (error) {
      caught = error;
    }
    db.close();

    // Sanity: prove this is genuinely the real driver's error shape, not an
    // assumption about what better-sqlite3 throws.
    expect((caught as { code?: string } | undefined)?.code).toBe(
      'SQLITE_CONSTRAINT_UNIQUE',
    );
    expect(isUniqueConstraintViolation(caught)).toBe(true);
  });

  it('recognizes a Postgres 23505 unique-violation error shape', () => {
    const pgError = Object.assign(
      new Error('duplicate key value violates unique constraint'),
      { code: '23505' },
    );
    expect(isUniqueConstraintViolation(pgError)).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isUniqueConstraintViolation(new Error('connection reset'))).toBe(
      false,
    );
    expect(isUniqueConstraintViolation({ code: 'ECONNRESET' })).toBe(false);
    expect(isUniqueConstraintViolation(null)).toBe(false);
    expect(isUniqueConstraintViolation(undefined)).toBe(false);
  });
});
