import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { MicrosoftAuthService } from './microsoft/microsoft-auth.service';
import { MicrosoftAuthController } from './microsoft/microsoft-auth.controller';
import { UsersModule } from '../users/users.module';

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
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}

