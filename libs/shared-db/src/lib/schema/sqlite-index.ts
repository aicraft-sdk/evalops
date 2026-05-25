/**
 * SQLite schema hub — used when EVALOPS_DEV_MODE=1.
 *
 * Only includes tables required for dev mode seeding and PAT auth.
 * Do NOT import from this file in production code.
 *
 * Phase 3: core tables only (users, organizations, personalAccessTokens).
 * Future phases will add the full schema equivalent for all Postgres tables.
 */
export * from './core.sqlite';
