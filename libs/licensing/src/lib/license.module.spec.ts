import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync } from 'crypto';
import * as fs from 'fs';
import { LicenseModule } from './license.module';
import { EntitlementService } from './entitlement.service';

describe('LicenseModule.forRoot', () => {
  it('does not throw when reading the committed public key fails, and license verification fails closed (CRITICAL fix)', async () => {
    const readFileSyncSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });
    try {
      // forRoot() reads the public key synchronously at module-composition time — before Nest's
      // DI container is even involved — so the read failure must be caught right here.
      expect(() => LicenseModule.forRoot()).not.toThrow();

      const moduleRef = await Test.createTestingModule({
        imports: [LicenseModule.forRoot()],
      })
        .overrideProvider(ConfigService)
        .useValue({ get: () => undefined })
        .compile();

      const service = moduleRef.get(EntitlementService);
      expect(() => service.onModuleInit()).not.toThrow();
      // Public key could not be read, so signature verification must fail closed, never crash.
      expect(service.getStatus()).toBe('none');
      expect(service.hasFeature('sso')).toBe(false);

      // Also prove fail-closed (not a crash) when a license value IS present — this exercises
      // crypto.verify() itself against the empty/invalid key, not just the "no license" shortcut.
      const moduleRefWithLicense = await Test.createTestingModule({
        imports: [LicenseModule.forRoot()],
      })
        .overrideProvider(ConfigService)
        .useValue({ get: () => 'some-non-empty-configured-license-value' })
        .compile();
      const serviceWithLicense = moduleRefWithLicense.get(EntitlementService);
      expect(() => serviceWithLicense.onModuleInit()).not.toThrow();
      expect(serviceWithLicense.getStatus()).toBe('malformed');
      expect(serviceWithLicense.hasFeature('sso')).toBe(false);
    } finally {
      readFileSyncSpy.mockRestore();
    }
  });

  it('wires EntitlementService end-to-end with an overridden public key, no env var set', async () => {
    const { publicKey } = generateKeyPairSync('ed25519');
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

    const moduleRef = await Test.createTestingModule({
      imports: [LicenseModule.forRoot({ publicKeyPem })],
    })
      .overrideProvider(ConfigService)
      .useValue({ get: () => undefined })
      .compile();

    const service = moduleRef.get(EntitlementService);
    await service.onModuleInit();
    expect(service.hasFeature('sso')).toBe(false);
    expect(service.getStatus()).toBe('none');
  });
});
