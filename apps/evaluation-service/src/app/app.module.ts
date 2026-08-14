import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health/health.controller';
import { RunsModule } from './runs/runs.module';
import { EvaluationModule } from './evaluation/evaluation.module';
import { PoliciesModule } from './policies/policies.module';
import { SharedDbModule } from '@evalops/shared-db';
import { IngestionModule } from './ingestion/ingestion.module';
import { SimulationsModule } from './simulations/simulations.module';
import { ReviewsModule } from './reviews/reviews.module';
import { OtlpModule } from './otlp/otlp.module';
import { TracesModule } from './traces/traces.module';
import { MigrationModule } from './migration/migration.module';
import { SandboxExecutionModule } from './sandbox-execution/sandbox-execution.module';
import { GoldenSetsModule } from './golden-sets/golden-sets.module';
import { JwtAuthGuard } from '@evalops/shared-auth';
import { LicenseModule } from '@evalops/licensing';
import { PrDecorationController, PrDecorationService, RUN_LOOKUP } from '@evalops/ee-pr-decoration';
import { RunsService } from './runs/runs.service';
import {
  LoggingInterceptor,
  OrgContextInterceptor,
  LoggingExceptionFilter,
} from '@evalops/shared-common';
import { JwtStrategy } from './auth/jwt.strategy';

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
    SharedDbModule,
    LicenseModule.forRoot(),
    RunsModule,
    EvaluationModule,
    PoliciesModule,
    IngestionModule,
    SimulationsModule,
    ReviewsModule,
    OtlpModule,
    TracesModule,
    MigrationModule,
    SandboxExecutionModule,
    GoldenSetsModule,
  ],
  // PrDecorationController/PrDecorationService are declared directly here
  // (not wrapped in the library's own `PrDecorationModule`) because NestJS
  // scopes providers per-module: a `{ provide: RUN_LOOKUP, useExisting:
  // RunsService }` binding is only resolvable by consumers declared in the
  // SAME module as that binding — this mirrors how AuthModule wires
  // `SSO_USER_PROVISIONER`/`MicrosoftAuthController`/`MicrosoftAuthService`
  // directly into itself for the identical reason (see
  // apps/auth-service/src/app/auth/auth.module.ts).
  controllers: [AppController, HealthController, PrDecorationController],
  providers: [
    AppService,
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: OrgContextInterceptor },
    { provide: APP_FILTER, useClass: LoggingExceptionFilter },
    PrDecorationService,
    { provide: RUN_LOOKUP, useExisting: RunsService },
  ],
})
export class AppModule {}
