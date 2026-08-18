import type { LicenseClaims, LicenseState } from './types/license.types';
import { GRACE_PERIOD_MS } from './types/license.types';

/** Pure: takes `now` explicitly so grace/expiry logic is fully unit-testable with a faked clock. */
export function computeLicenseStatus(claims: LicenseClaims, now: Date): LicenseState {
  const expiresAtMs = Date.parse(claims.expiresAt);
  const nowMs = now.getTime();
  if (nowMs < expiresAtMs) return { status: 'valid', claims };
  if (nowMs <= expiresAtMs + GRACE_PERIOD_MS) return { status: 'expired_grace', claims };
  return { status: 'expired', claims: null };
}
