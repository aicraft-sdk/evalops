import { Module } from '@nestjs/common';
import { PythonWorkerService } from './python-worker.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [PythonWorkerService],
  exports: [PythonWorkerService],
})
export class PythonWorkerModule {}

