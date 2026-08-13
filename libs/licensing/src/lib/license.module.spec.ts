import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync } from 'crypto';
import { LicenseModule } from './license.module';
import { EntitlementService } from './entitlement.service';

describe('LicenseModule.forRoot', () => {
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
