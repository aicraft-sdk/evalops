import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { LoggingInterceptor, OrgContextInterceptor } from '@evalops/shared-common';
import { SharedDbModule } from '@evalops/shared-db';
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
  ],
})
export class AppModule {}
