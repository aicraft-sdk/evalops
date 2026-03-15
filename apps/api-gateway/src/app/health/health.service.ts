import { Injectable } from '@nestjs/common';
import { GatewayService } from '../gateway/gateway.service';

@Injectable()
export class HealthService {
  constructor(private readonly gatewayService: GatewayService) {}

  async checkHealth() {
    const services = this.gatewayService.getAllServices();
    const healthChecks = await Promise.allSettled(
      services.map(async (service) => ({
        name: service,
        healthy: await this.gatewayService.checkServiceHealth(service),
      })),
    );

    const servicesHealth = healthChecks.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      return {
        name: services[index],
        healthy: false,
        error: result.reason?.message,
      };
    });

    const allHealthy = servicesHealth.every((s) => s.healthy);

    return {
      status: allHealthy ? 'ok' : 'degraded',
      gateway: 'healthy',
      services: servicesHealth,
      timestamp: new Date().toISOString(),
    };
  }
}

