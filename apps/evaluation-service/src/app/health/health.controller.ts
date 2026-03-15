import { Controller, Get } from '@nestjs/common';
import { Public } from '@evalops/shared-auth';

@Controller('health')
export class HealthController {
  @Get()
  @Public()
  check() {
    return {
      status: 'ok',
      service: 'evaluation-service',
      timestamp: new Date().toISOString(),
    };
  }
}
