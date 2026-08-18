import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { UsersModule } from '../users/users.module';
import {
  MicrosoftAuthController,
  MicrosoftAuthService,
  SSO_USER_PROVISIONER,
} from '@evalops/ee-sso';

// NOTE: MicrosoftAuthController/MicrosoftAuthService/SSO_USER_PROVISIONER are declared
// directly in AuthModule (not wrapped in a separate NestJS `SsoModule`) because NestJS
// scopes providers per-module: a `{ provide: SSO_USER_PROVISIONER, useExisting: AuthService }`
// binding is only resolvable by consumers declared in the SAME module as AuthService (which
// is a plain, non-@Global() provider here) — this mirrors how @evalops/shared-auth's
// PAT_VALIDATOR is actually wired in this codebase (see tokens.module.ts: ApiAuthGuard and
// its PAT_VALIDATOR binding are co-located in one module for the same reason).
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: (() => {
          const secret = configService.get<string>('JWT_SECRET');
          if (!secret) throw new Error('JWT_SECRET is required');
          return secret;
        })(),
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRES_IN') || '24h',
        },
      }),
      inject: [ConfigService],
    }),
    UsersModule,
  ],
  controllers: [AuthController, MicrosoftAuthController],
  providers: [
    AuthService,
    JwtStrategy,
    LocalStrategy,
    MicrosoftAuthService,
    { provide: SSO_USER_PROVISIONER, useExisting: AuthService },
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}

