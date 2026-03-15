import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { CoreClientService } from './core-client.service';

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [CoreClientService],
  exports: [CoreClientService],
})
export class CoreClientModule {}
