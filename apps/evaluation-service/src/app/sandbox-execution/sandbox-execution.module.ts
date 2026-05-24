import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { CoreClientModule } from '../core-client/core-client.module';
import { SandboxExecutionService } from './sandbox-execution.service';
import { HttpClientService } from '@evalops/shared-common';

@Module({
  imports: [HttpModule, ConfigModule, CoreClientModule],
  providers: [SandboxExecutionService, HttpClientService],
  exports: [SandboxExecutionService],
})
export class SandboxExecutionModule {}
