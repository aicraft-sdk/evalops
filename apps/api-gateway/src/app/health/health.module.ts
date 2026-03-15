import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [HttpModule, GatewayModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}

