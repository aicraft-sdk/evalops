import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { GatewayService } from './gateway.service';
import { GatewayController } from './gateway.controller';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [HttpModule, AuthModule],
  controllers: [GatewayController],
  providers: [GatewayService],
  exports: [GatewayService],
})
export class GatewayModule {}

