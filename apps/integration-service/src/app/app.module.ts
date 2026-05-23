import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health/health.controller';
import { AzureModule } from './azure/azure.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { AlertsModule } from './alerts/alerts.module';
import { StorageModule } from './storage/storage.module';
import { ArtifactsModule } from './artifacts/artifacts.module';
import { SandboxModule } from './sandbox/sandbox.module';
import { JwtAuthGuard } from '@evalops/shared-auth';
import {
  LoggingInterceptor,
  OrgContextInterceptor,
} from '@evalops/shared-common';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret) throw new Error('JWT_SECRET is required');
        return { secret };
      },
      inject: [ConfigService],
    }),
    StorageModule,
    AzureModule,
    WebhooksModule,
    AlertsModule,
    ArtifactsModule,
    SandboxModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: OrgContextInterceptor },
  ],
})
export class AppModule {}
