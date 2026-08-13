import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LicenseVerifierService } from './license-verifier.service';
import { computeLicenseStatus } from './license-status.util';
import type { EnterpriseFeature, LicenseClaims, LicenseStatus } from './types/license.types';
import { readFileSync, existsSync } from 'fs';

@Injectable()
export class EntitlementService implements OnModuleInit {
  private readonly logger = new Logger(EntitlementService.name);
  private bootClaims: LicenseClaims | null = null;
  private bootStatus: LicenseStatus = 'none';
  private loggedGraceWarningOnce = false;

  constructor(
    private readonly verifier: LicenseVerifierService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    const configured = this.configService.get<string>('EVALOPS_LICENSE_KEY');
    const raw = this.resolveRawEnvelope(configured);
    const result = this.verifier.verify(raw);
    this.bootStatus = result.status;
    this.bootClaims = result.claims;
    this.logBootStatus();
  }

  /** Never throws — total over all license states (P1). */
  hasFeature(feature: EnterpriseFeature): boolean {
    const current = this.computeCurrentState();
    if (current.status === 'expired_grace' && !this.loggedGraceWarningOnce) {
      this.logger.warn(
        `Enterprise license for "${current.claims?.orgName}" expired on ${current.claims?.expiresAt} — running on a 14-day grace period.`,
      );
      // Rate-limited to once per process to avoid log-spam per request while still recurring
      // across process restarts / long uptimes at a coarse granularity for Phase 1.
      this.loggedGraceWarningOnce = true;
    }
    if (current.status !== 'valid' && current.status !== 'expired_grace') return false;
    return current.claims?.features.includes(feature) ?? false;
  }

  getStatus(): LicenseStatus {
    return this.computeCurrentState().status;
  }

  private computeCurrentState() {
    if (this.bootStatus !== 'valid' && this.bootStatus !== 'expired_grace') {
      return { status: this.bootStatus, claims: this.bootClaims };
    }
    if (!this.bootClaims) return { status: 'none' as const, claims: null };
    return computeLicenseStatus(this.bootClaims, new Date());
  }

  private resolveRawEnvelope(configured: string | undefined): string | undefined {
    if (!configured) return undefined;
    if (existsSync(configured)) return readFileSync(configured, 'utf-8').trim();
    return configured;
  }

  private logBootStatus(): void {
    switch (this.bootStatus) {
      case 'none':
        this.logger.log('No Enterprise license configured — Enterprise features disabled.');
        break;
      case 'valid':
        this.logger.log(`Enterprise license valid for "${this.bootClaims?.orgName}" — features: [${this.bootClaims?.features.join(', ')}].`);
        break;
      case 'malformed':
        this.logger.error('Enterprise license is malformed or its signature failed verification — Enterprise features disabled.');
        break;
      default:
        break;
    }
  }
}
