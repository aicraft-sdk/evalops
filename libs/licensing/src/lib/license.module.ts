import { DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { LICENSE_PUBLIC_KEY } from './tokens';
import { LicenseVerifierService } from './license-verifier.service';
import { EntitlementService } from './entitlement.service';

export interface LicenseModuleOptions {
  /** Test-only override. Production always uses the committed public key. */
  publicKeyPem?: string;
}

@Global()
@Module({})
export class LicenseModule {
  static forRoot(options: LicenseModuleOptions = {}): DynamicModule {
    const publicKeyPem =
      options.publicKeyPem ?? readFileSync(join(__dirname, 'keys/license-public-key.pem'), 'utf-8');

    return {
      module: LicenseModule,
      imports: [ConfigModule],
      providers: [
        { provide: LICENSE_PUBLIC_KEY, useValue: publicKeyPem },
        LicenseVerifierService,
        EntitlementService,
      ],
      exports: [EntitlementService],
    };
  }
}
