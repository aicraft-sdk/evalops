import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  Optional,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SCOPES_KEY } from '../decorators/require-scopes.decorator';

export const PAT_TOKEN_PREFIX = 'evops_pat_';

export const PAT_VALIDATOR = Symbol('PAT_VALIDATOR');

export interface PatRecord {
  id: string;
  userId: string;
  organizationId: string;
  scopes: string[];
  revokedAt: Date | null;
  expiresAt: Date | null;
}

export interface PatValidator {
  findByTokenHash(hash: string): Promise<PatRecord | undefined>;
  updateLastUsed(id: string): Promise<void>;
}

export interface PATUserPayload {
  id: string;
  organizationId: string;
  scopes: string[];
  tokenId: string;
}

/**
 * Drop-in replacement for JwtAuthGuard that also accepts long-lived PATs.
 *
 * Token routing:
 *   Authorization: Bearer evops_pat_...  → PAT path (DB lookup via PatValidator)
 *   Authorization: Bearer <jwt>          → JWT path (Passport jwt strategy)
 *
 * PAT validation is delegated to PAT_VALIDATOR injection token so that
 * shared-auth has no compile-time dependency on shared-db. Each consuming
 * service provides the binding via its module.
 */
@Injectable()
export class ApiAuthGuard extends JwtAuthGuard {
  private readonly ownReflector: Reflector;

  constructor(
    reflector: Reflector,
    @Optional() @Inject(PAT_VALIDATOR) private readonly patValidator?: PatValidator,
  ) {
    super(reflector);
    this.ownReflector = reflector;
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.ownReflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const headers = request['headers'] as Record<string, string> | undefined;
    const authHeader = headers?.['authorization'] ?? '';

    if (authHeader.startsWith(`Bearer ${PAT_TOKEN_PREFIX}`)) {
      return this.validatePat(authHeader.slice('Bearer '.length), request, context);
    }

    return super.canActivate(context) as Promise<boolean>;
  }

  private async validatePat(
    raw: string,
    request: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<boolean> {
    if (!this.patValidator) {
      throw new UnauthorizedException('PAT validation is not configured for this service');
    }

    const hash = createHash('sha256').update(raw).digest('hex');
    const pat = await this.patValidator.findByTokenHash(hash);

    if (!pat) {
      throw new UnauthorizedException('Invalid token');
    }
    if (pat.revokedAt) {
      throw new UnauthorizedException('Token has been revoked');
    }
    if (pat.expiresAt && pat.expiresAt < new Date()) {
      throw new UnauthorizedException('Token has expired');
    }

    // Best-effort last-used tracking; DB failure must not block valid auth
    this.patValidator.updateLastUsed(pat.id).catch(() => undefined);

    request['user'] = {
      id: pat.userId,
      organizationId: pat.organizationId,
      scopes: pat.scopes,
      tokenId: pat.id,
    } satisfies PATUserPayload;

    const required = this.ownReflector.getAllAndOverride<string[]>(SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? [];
    if (required.length > 0) {
      const missing = required.filter((s) => !pat.scopes.includes(s));
      if (missing.length > 0) {
        throw new UnauthorizedException(`Token missing required scopes: ${missing.join(', ')}`);
      }
    }

    return true;
  }
}
