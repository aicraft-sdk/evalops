import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '@evalops/shared-auth';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: (() => {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret) throw new Error('JWT_SECRET is required');
        return secret;
      })(),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.authService.validateJwtPayload(payload);
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      organizationId: user.organizationId,
      // Keep `role` (singular) for existing auth-service call sites that
      // still read it, but ALSO set `roles` (plural array) — RbacGuard
      // (libs/shared-auth) reads `user.roles`, matching the convention
      // already used by core-service/evaluation-service/api-gateway's
      // JwtStrategy. Without this, `roles` was always undefined here and
      // every @Roles()-gated route in auth-service unconditionally 403'd.
      role: user.role,
      roles: user.role ? [user.role] : [],
    };
  }
}

