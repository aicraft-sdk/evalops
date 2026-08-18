import { sign as cryptoSign } from 'crypto';
import type { LicenseClaims } from './types/license.types';

/**
 * Builds a signed license envelope for the given claims, using the supplied
 * Ed25519 private key (PKCS8 PEM). Inverse of LicenseVerifierService's parsing
 * logic — used by `scripts/licensing/sign-license.ts` (dev/test license
 * issuance) and by e2e test fixtures that need a real signed envelope without
 * touching the actual vaulted production private key.
 */
export function signLicenseEnvelope(claims: LicenseClaims, privateKeyPem: string): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64');
  const signature = cryptoSign(null, Buffer.from(payload), privateKeyPem).toString('base64');
  return Buffer.from(JSON.stringify({ payload, signature })).toString('base64');
}
