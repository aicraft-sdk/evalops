import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { EntitlementService } from './entitlement.service';
import { LicenseVerifierService } from './license-verifier.service';

describe('EntitlementService', () => {
  it('hasFeature returns false and never throws when EVALOPS_LICENSE_KEY is a filesystem path that does not exist (edge case 3)', async () => {
    const verifier = { verify: jest.fn().mockReturnValue({ status: 'malformed', claims: null }) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        EntitlementService,
        { provide: LicenseVerifierService, useValue: verifier },
        { provide: ConfigService, useValue: { get: () => '/no/such/path/on/disk/license.txt' } },
      ],
    }).compile();
    const service = moduleRef.get(EntitlementService);
    expect(() => service.onModuleInit()).not.toThrow();
    expect(service.hasFeature('sso')).toBe(false);
    // The nonexistent path string itself is passed through to verify() as a raw value
    // (never treated as file content) — proves resolveRawEnvelope() doesn't silently
    // swallow the missing-file case into "no license configured".
    expect(verifier.verify).toHaveBeenCalledWith('/no/such/path/on/disk/license.txt');
  });

  it('hasFeature returns false and never throws when EVALOPS_LICENSE_KEY is a filesystem path that exists but is empty (edge case 4)', async () => {
    const tmpFile = join(tmpdir(), `empty-license-${Date.now()}.txt`);
    writeFileSync(tmpFile, '');
    try {
      const verifier = { verify: jest.fn().mockReturnValue({ status: 'none', claims: null }) };
      const moduleRef = await Test.createTestingModule({
        providers: [
          EntitlementService,
          { provide: LicenseVerifierService, useValue: verifier },
          { provide: ConfigService, useValue: { get: () => tmpFile } },
        ],
      }).compile();
      const service = moduleRef.get(EntitlementService);
      expect(() => service.onModuleInit()).not.toThrow();
      expect(service.hasFeature('sso')).toBe(false);
      // The file's (empty) content is read and passed through, not the raw path string —
      // proves the existsSync branch actually reads file content rather than skipping it.
      expect(verifier.verify).toHaveBeenCalledWith('');
    } finally {
      unlinkSync(tmpFile);
    }
  });

  it('hasFeature returns false for every feature when no license is configured (P1, edge case 1)', async () => {
    const verifier = { verify: jest.fn().mockReturnValue({ status: 'none', claims: null }) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        EntitlementService,
        { provide: LicenseVerifierService, useValue: verifier },
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).compile();
    const service = moduleRef.get(EntitlementService);
    await service.onModuleInit();
    expect(service.hasFeature('sso')).toBe(false);
    expect(service.hasFeature('audit-export')).toBe(false);
  });

  it('verifies the signature exactly once per process lifetime, not per hasFeature() call (P5)', async () => {
    const verifier = {
      verify: jest.fn().mockReturnValue({
        status: 'valid',
        claims: { licenseId: 'x', orgName: 'Acme', features: ['sso'], issuedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z' },
      }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        EntitlementService,
        { provide: LicenseVerifierService, useValue: verifier },
        { provide: ConfigService, useValue: { get: () => 'irrelevant-raw-value' } },
      ],
    }).compile();
    const service = moduleRef.get(EntitlementService);
    await service.onModuleInit();
    service.hasFeature('sso');
    service.hasFeature('sso');
    service.hasFeature('audit-export');
    expect(verifier.verify).toHaveBeenCalledTimes(1);
  });

  it('is per-feature, not a single global switch (P3, edge case 16)', async () => {
    const verifier = {
      verify: jest.fn().mockReturnValue({
        status: 'valid',
        claims: { licenseId: 'x', orgName: 'Acme', features: ['audit-export'], issuedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z' },
      }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        EntitlementService,
        { provide: LicenseVerifierService, useValue: verifier },
        { provide: ConfigService, useValue: { get: () => 'irrelevant-raw-value' } },
      ],
    }).compile();
    const service = moduleRef.get(EntitlementService);
    await service.onModuleInit();
    expect(service.hasFeature('audit-export')).toBe(true);
    expect(service.hasFeature('sso')).toBe(false);
  });

  it('transitions from valid to expired_grace to hard-expired purely from Date.now(), no re-verification (P6)', async () => {
    const claims = { licenseId: 'x', orgName: 'Acme', features: ['sso'], issuedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-06-01T00:00:00.000Z' };
    const verifier = { verify: jest.fn().mockReturnValue({ status: 'valid', claims }) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        EntitlementService,
        { provide: LicenseVerifierService, useValue: verifier },
        { provide: ConfigService, useValue: { get: () => 'irrelevant-raw-value' } },
      ],
    }).compile();
    const service = moduleRef.get(EntitlementService);
    await service.onModuleInit();

    jest.useFakeTimers().setSystemTime(new Date('2026-03-01T00:00:00.000Z'));
    expect(service.hasFeature('sso')).toBe(true); // valid

    jest.setSystemTime(new Date('2026-06-10T00:00:00.000Z'));
    expect(service.hasFeature('sso')).toBe(true); // expired_grace, still entitled

    jest.setSystemTime(new Date('2026-06-20T00:00:00.000Z'));
    expect(service.hasFeature('sso')).toBe(false); // hard expired

    expect(verifier.verify).toHaveBeenCalledTimes(1); // never re-verified
    jest.useRealTimers();
  });
});
