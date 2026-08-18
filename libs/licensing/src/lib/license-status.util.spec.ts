import { computeLicenseStatus } from './license-status.util';
import type { LicenseClaims } from './types/license.types';

const baseClaims: LicenseClaims = {
  licenseId: 'lic_1', orgName: 'Acme', features: ['sso', 'audit-export'],
  issuedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-06-01T00:00:00.000Z',
};

describe('computeLicenseStatus', () => {
  it('returns valid when expiresAt is in the future', () => {
    const now = new Date('2026-03-01T00:00:00.000Z');
    expect(computeLicenseStatus(baseClaims, now)).toEqual({ status: 'valid', claims: baseClaims });
  });

  it('returns expired_grace exactly at the expiry boundary', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    expect(computeLicenseStatus(baseClaims, now).status).toBe('expired_grace');
  });

  it('returns expired_grace exactly 14 days past expiry (inclusive)', () => {
    const now = new Date('2026-06-15T00:00:00.000Z');
    expect(computeLicenseStatus(baseClaims, now).status).toBe('expired_grace');
  });

  it('returns expired 14 days and 1 second past expiry', () => {
    const now = new Date('2026-06-15T00:00:01.000Z');
    expect(computeLicenseStatus(baseClaims, now).status).toBe('expired');
  });

  it('returns valid (not none) even when features is empty', () => {
    const now = new Date('2026-03-01T00:00:00.000Z');
    const emptyClaims: LicenseClaims = { ...baseClaims, features: [] };
    expect(computeLicenseStatus(emptyClaims, now).status).toBe('valid');
  });
});
