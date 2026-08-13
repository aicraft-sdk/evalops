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
  /** Set when EVALOPS_LICENSE_KEY resolved to a directory/file that could not be read. */
  private bootReadError: string | null = null;
  /** Set when EVALOPS_LICENSE_KEY was explicitly set but resolved to an empty value
   * (distinct from "not configured at all" — see logBootStatus). */
  private configuredButUnresolved = false;
  /** Wall-clock timestamp (ms) of the last grace-period WARN emission, or null if none
   * has fired yet this process. Backs the coarse throttle in hasFeature() below. */
  private lastGraceWarningAt: number | null = null;
  /** Coarse throttle window for the grace-period WARN: bounds per-request log volume
   * (Risk table: "noisy for up to 14 days") while staying recurring/prominent enough
   * for alerting across the grace window (Behavior Contract: not a one-shot warning). */
  private static readonly GRACE_WARNING_THROTTLE_MS = 60_000;

  constructor(
    private readonly verifier: LicenseVerifierService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    const configured = this.configService.get<string>('EVALOPS_LICENSE_KEY');
    let raw: string | undefined;
    try {
      raw = this.resolveRawEnvelope(configured);
    } catch (err) {
      // A configured path that exists but can't be read as a plain file (directory,
      // restrictive permissions, etc.) must never crash app bootstrap — collapse to
      // 'malformed', the same as any other misconfigured/tampered license (fail closed).
      this.bootReadError = err instanceof Error ? err.message : String(err);
      this.bootStatus = 'malformed';
      this.bootClaims = null;
      this.logBootStatus();
      return;
    }
    const result = this.verifier.verify(raw);
    this.bootStatus = result.status;
    this.bootClaims = result.claims;
    this.configuredButUnresolved = Boolean(configured) && !raw;
    this.logBootStatus();
  }

  /** Never throws — total over all license states (P1). */
  hasFeature(feature: EnterpriseFeature): boolean {
    const current = this.computeCurrentState();
    if (current.status === 'expired_grace') {
      // Recurring (not just once per process) so log-based alerting on the 14-day
      // countdown stays visible for the full grace period, not just at boot — but
      // throttled to a coarse interval so a real production request volume during the
      // grace window can't produce unbounded per-request WARN log volume.
      const now = Date.now();
      if (
        this.lastGraceWarningAt === null ||
        now - this.lastGraceWarningAt >= EntitlementService.GRACE_WARNING_THROTTLE_MS
      ) {
        this.logger.warn(
          `Enterprise license for "${current.claims?.orgName}" expired on ${current.claims?.expiresAt} — running on a 14-day grace period.`,
        );
        this.lastGraceWarningAt = now;
      }
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
        if (this.configuredButUnresolved) {
          // EVALOPS_LICENSE_KEY was explicitly set (e.g. to a file path) but resolved to an
          // empty value — distinct from "not configured at all"; this masks a real
          // misconfiguration if only logged at INFO.
          this.logger.error(
            'EVALOPS_LICENSE_KEY is configured but resolved to an empty license — Enterprise features disabled. Check the license file path and contents.',
          );
        } else {
          this.logger.log('No Enterprise license configured — Enterprise features disabled.');
        }
        break;
      case 'valid':
        this.logger.log(`Enterprise license valid for "${this.bootClaims?.orgName}" — features: [${this.bootClaims?.features.join(', ')}].`);
        break;
      case 'malformed':
        if (this.bootReadError) {
          this.logger.error(
            `Enterprise license file could not be read (${this.bootReadError}) — Enterprise features disabled.`,
          );
        } else {
          this.logger.error('Enterprise license is malformed or its signature failed verification — Enterprise features disabled.');
        }
        break;
      default:
        break;
    }
  }
}
