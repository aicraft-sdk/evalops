import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PromptsModule } from './prompts/prompts.module';
import { DatasetsModule } from './datasets/datasets.module';
import { EvalSpecsModule } from './eval-specs/eval-specs.module';
import { RunsModule } from './runs/runs.module';
import { PoliciesModule } from './policies/policies.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    AuthModule,
    UsersModule,
    PromptsModule,
    DatasetsModule,
    EvalSpecsModule,
    RunsModule,
    PoliciesModule,
    AnalyticsModule,
    StorageModule,
  ],
})
export class AppModule {}

