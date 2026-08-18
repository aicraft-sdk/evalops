import { generateKeyPairSync, verify as cryptoVerify } from 'crypto';
import { signLicenseEnvelope } from './sign-license.util';
import type { LicenseClaims } from './types/license.types';

describe('signLicenseEnvelope', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const claims: LicenseClaims = {
    licenseId: 'lic_test', orgName: 'Acme', features: ['sso', 'audit-export'],
    issuedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-06-01T00:00:00.000Z',
  };

  it('produces an envelope whose signature verifies against the matching public key', () => {
    const envelope = signLicenseEnvelope(claims, privateKeyPem);
    const decoded = JSON.parse(Buffer.from(envelope, 'base64').toString('utf-8'));
    const verified = cryptoVerify(
      null,
      Buffer.from(decoded.payload),
      publicKeyPem,
      Buffer.from(decoded.signature, 'base64'),
    );
    expect(verified).toBe(true);
    const decodedClaims = JSON.parse(Buffer.from(decoded.payload, 'base64').toString('utf-8'));
    expect(decodedClaims).toEqual(claims);
  });

  it('fails verification if the payload is tampered with after signing', () => {
    const envelope = signLicenseEnvelope(claims, privateKeyPem);
    const decoded = JSON.parse(Buffer.from(envelope, 'base64').toString('utf-8'));
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...claims, orgName: 'Evil Corp' }),
    ).toString('base64');
    const verified = cryptoVerify(
      null,
      Buffer.from(tamperedPayload),
      publicKeyPem,
      Buffer.from(decoded.signature, 'base64'),
    );
    expect(verified).toBe(false);
  });

  it('fails verification against a DIFFERENT keypair (wrong signer)', () => {
    const { privateKey: otherPrivate } = generateKeyPairSync('ed25519');
    const envelope = signLicenseEnvelope(
      claims,
      otherPrivate.export({ type: 'pkcs8', format: 'pem' }).toString(),
    );
    const decoded = JSON.parse(Buffer.from(envelope, 'base64').toString('utf-8'));
    const verified = cryptoVerify(
      null,
      Buffer.from(decoded.payload),
      publicKeyPem, // the ORIGINAL public key, not otherPrivate's counterpart
      Buffer.from(decoded.signature, 'base64'),
    );
    expect(verified).toBe(false);
  });
});
