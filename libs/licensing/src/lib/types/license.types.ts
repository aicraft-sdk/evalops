export type EnterpriseFeature = 'sso' | 'rbac-custom-roles' | 'audit-export' | 'pr-decoration';

export interface LicenseClaims {
  licenseId: string;
  orgName: string;
  features: string[]; // intentionally string[], not EnterpriseFeature[] — unknown/future feature
                       // strings must parse without error (edge case 14); hasFeature() narrows.
  issuedAt: string; // ISO 8601
  expiresAt: string; // ISO 8601
}

export type LicenseStatus = 'none' | 'valid' | 'expired_grace' | 'expired' | 'malformed';

export interface LicenseState {
  status: LicenseStatus;
  claims: LicenseClaims | null;
}

export const GRACE_PERIOD_MS = 14 * 24 * 60 * 60 * 1000;
