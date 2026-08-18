import { DynamicModule, Global, Logger, Module } from '@nestjs/common';
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
  private static readonly logger = new Logger(LicenseModule.name);

  static forRoot(options: LicenseModuleOptions = {}): DynamicModule {
    const publicKeyPem = options.publicKeyPem ?? LicenseModule.readCommittedPublicKey();

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

  /**
   * Reads the committed public key, never throwing. A read failure here (e.g. corrupted
   * install, restrictive filesystem permissions) must not crash app bootstrap — it collapses
   * to an empty key, which makes every signature verification fail closed (LicenseVerifierService
   * treats an invalid PEM as a verification failure, not a crash), matching the same fail-closed
   * contract as every other license misconfiguration path.
   */
  private static readCommittedPublicKey(): string {
    try {
      return readFileSync(join(__dirname, 'keys/license-public-key.pem'), 'utf-8');
    } catch (err) {
      LicenseModule.logger.error(
        `Failed to read the committed Enterprise license public key: ${err instanceof Error ? err.message : String(err)} — Enterprise license verification will fail closed.`,
      );
      return '';
    }
  }
}
