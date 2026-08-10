import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health/health.controller';
import { PromptsModule } from './prompts/prompts.module';
import { FlowsModule } from './flows/flows.module';
import { DatasetsModule } from './datasets/datasets.module';
import { EvalSpecsModule } from './eval-specs/eval-specs.module';
import { ProvidersModule } from './providers/providers.module';
import { ModelsModule } from './models/models.module';
import { SharedDbModule } from '@evalops/shared-db';
import { AgentsModule } from './agents/agents.module';
import { JwtAuthGuard } from '@evalops/shared-auth';
import { JwtStrategy } from './jwt.strategy';
import {
  LoggingInterceptor,
  OrgContextInterceptor,
  LoggingExceptionFilter,
} from '@evalops/shared-common';
import { CoreIntegrationModule } from '@evalops/core-integration';
import { CoreAnalyticsModule } from '@evalops/core-analytics';

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
    PromptsModule,
    FlowsModule,
    DatasetsModule,
    EvalSpecsModule,
    ProvidersModule,
    ModelsModule,
    AgentsModule,
    CoreIntegrationModule,
    CoreAnalyticsModule,
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
