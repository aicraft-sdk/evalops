import { generateKeyPairSync, sign as cryptoSign } from 'crypto';
import { LicenseVerifierService } from './license-verifier.service';
import type { LicenseClaims } from './types/license.types';

function makeKeypair() {
  return generateKeyPairSync('ed25519');
}

function signEnvelope(claims: LicenseClaims, privateKey: import('crypto').KeyObject): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64');
  const signature = cryptoSign(null, Buffer.from(payload), privateKey).toString('base64');
  return Buffer.from(JSON.stringify({ payload, signature })).toString('base64');
}

describe('LicenseVerifierService', () => {
  const { publicKey, privateKey } = makeKeypair();
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const claims: LicenseClaims = {
    licenseId: 'lic_1', orgName: 'Acme', features: ['sso'],
    issuedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z',
  };
  const verifier = new LicenseVerifierService(publicKeyPem);

  it('returns none for undefined input', () => {
    expect(verifier.verify(undefined).status).toBe('none');
  });
  it('returns none for empty string input', () => {
    expect(verifier.verify('').status).toBe('none');
  });
  it('returns malformed for non-base64 input', () => {
    expect(verifier.verify('!!!not-base64!!!').status).toBe('malformed');
  });
  it('returns malformed for base64 that decodes to non-JSON', () => {
    expect(verifier.verify(Buffer.from('not json').toString('base64')).status).toBe('malformed');
  });
  it('returns malformed when a required LicenseClaims field is missing', () => {
    const bad = Buffer.from(JSON.stringify({ payload: Buffer.from('{}').toString('base64'), signature: 'x' })).toString('base64');
    expect(verifier.verify(bad).status).toBe('malformed');
  });
  it('returns malformed when signature field is missing', () => {
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64');
    const bad = Buffer.from(JSON.stringify({ payload })).toString('base64');
    expect(verifier.verify(bad).status).toBe('malformed');
  });
  it('returns malformed when signature verification fails (tampered payload)', () => {
    const raw = signEnvelope(claims, privateKey);
    const envelope = JSON.parse(Buffer.from(raw, 'base64').toString());
    const tamperedPayload = Buffer.from(JSON.stringify({ ...claims, orgName: 'Evil Corp' })).toString('base64');
    const tampered = Buffer.from(JSON.stringify({ payload: tamperedPayload, signature: envelope.signature })).toString('base64');
    expect(verifier.verify(tampered).status).toBe('malformed');
  });
  it('returns malformed when signed with a different keypair', () => {
    const otherKeypair = makeKeypair();
    const raw = signEnvelope(claims, otherKeypair.privateKey);
    expect(verifier.verify(raw).status).toBe('malformed');
  });
  it('returns valid for a correctly signed, unexpired license', () => {
    const raw = signEnvelope(claims, privateKey);
    const result = verifier.verify(raw);
    expect(result.status).toBe('valid');
    expect(result.claims?.features).toEqual(['sso']);
  });
  it('returns valid (not malformed) for a license with an empty features array', () => {
    const raw = signEnvelope({ ...claims, features: [] }, privateKey);
    expect(verifier.verify(raw).status).toBe('valid');
  });
  it('does not throw for a license containing an unknown feature string', () => {
    const raw = signEnvelope({ ...claims, features: ['sso', 'some-future-feature'] }, privateKey);
    expect(() => verifier.verify(raw)).not.toThrow();
    expect(verifier.verify(raw).status).toBe('valid');
  });
});
