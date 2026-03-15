import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';
import { Public } from '@evalops/shared-auth';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @Public()
  async check() {
    return this.healthService.checkHealth();
  }
}

