import { Inject, Injectable } from '@nestjs/common';
import { verify as cryptoVerify } from 'crypto';
import { LICENSE_PUBLIC_KEY } from './tokens';
import type { LicenseClaims, LicenseState } from './types/license.types';

const REQUIRED_FIELDS: (keyof LicenseClaims)[] = ['licenseId', 'orgName', 'features', 'issuedAt', 'expiresAt'];

function isLicenseClaims(value: unknown): value is LicenseClaims {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return REQUIRED_FIELDS.every((f) => f in record) && Array.isArray(record['features']);
}

@Injectable()
export class LicenseVerifierService {
  constructor(@Inject(LICENSE_PUBLIC_KEY) private readonly publicKeyPem: string) {}

  /** Total function: never throws, always returns a LicenseState. */
  verify(rawEnvelope: string | undefined): LicenseState {
    if (!rawEnvelope) return { status: 'none', claims: null };

    try {
      const envelopeJson = Buffer.from(rawEnvelope, 'base64').toString('utf-8');
      const envelope = JSON.parse(envelopeJson) as { payload?: unknown; signature?: unknown };
      if (typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string') {
        return { status: 'malformed', claims: null };
      }

      const verified = cryptoVerify(
        null,
        Buffer.from(envelope.payload),
        this.publicKeyPem,
        Buffer.from(envelope.signature, 'base64'),
      );
      if (!verified) return { status: 'malformed', claims: null };

      const claimsJson = Buffer.from(envelope.payload, 'base64').toString('utf-8');
      const claims: unknown = JSON.parse(claimsJson);
      if (!isLicenseClaims(claims)) return { status: 'malformed', claims: null };

      return { status: 'valid', claims };
    } catch {
      // Any parse/decode/verify exception collapses to 'malformed' — verify() is total.
      return { status: 'malformed', claims: null };
    }
  }
}
