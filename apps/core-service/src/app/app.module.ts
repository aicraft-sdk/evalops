import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
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
import { StorageModule } from './storage/storage.module';
import { AgentsModule } from './agents/agents.module';
import { JwtAuthGuard } from '@evalops/shared-auth';
import { LoggingInterceptor, TenantInterceptor } from '@evalops/shared-common';

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
    PromptsModule,
    FlowsModule,
    DatasetsModule,
    EvalSpecsModule,
    ProvidersModule,
    ModelsModule,
    AgentsModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
  ],
})
export class AppModule {}
