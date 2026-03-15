import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '@evalops/shared-auth';

/**
 * JWT Strategy for evaluation-service
 *
 * Validates JWT tokens and extracts user information from payload.
 * This service doesn't need to validate against a user database - it trusts
 * the JWT signature and extracts organizationId from the payload.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
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
    // Return user object that will be attached to request.user
    return {
      id: payload.sub,
      email: payload.email,
      organizationId: payload.organizationId,
      roles: payload.roles || [],
    };
  }
}
