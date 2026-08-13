import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import {
  LoggingInterceptor,
  OrgContextInterceptor,
  LoggingExceptionFilter,
} from '@evalops/shared-common';
import { SharedDbModule } from '@evalops/shared-db';
import { LicenseModule } from '@evalops/licensing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PermissionsModule } from './permissions/permissions.module';
import { AdminModule } from './admin/admin.module';
import { TokensModule } from './tokens/tokens.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    SharedDbModule,
    LicenseModule.forRoot(),
    AuthModule,
    UsersModule,
    OrganizationsModule,
    PermissionsModule,
    AdminModule,
    TokensModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: OrgContextInterceptor },
    { provide: APP_FILTER, useClass: LoggingExceptionFilter },
  ],
})
export class AppModule {}
