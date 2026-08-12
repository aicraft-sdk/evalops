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
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: OrgContextInterceptor },
    { provide: APP_FILTER, useClass: LoggingExceptionFilter },
  ],
})
export class AppModule {}
