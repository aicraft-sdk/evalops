import { of } from 'rxjs';
import { AxiosResponse } from 'axios';
import { GatewayService } from './gateway.service';

/**
 * Every downstream NestJS service in this repo has a global `/api` prefix
 * (see main.ts app.setGlobalPrefix('api') in auth-service/core-service/
 * evaluation-service). checkServiceHealth() previously requested
 * `${baseUrl}/health` — missing that prefix — so the gateway's composite
 * `/api/health` endpoint always reported downstream services unhealthy even
 * when they were actually up and responding correctly at `/api/health`.
 */
describe('GatewayService checkServiceHealth', () => {
  function buildService(getMock: jest.Mock) {
    const httpService = { get: getMock } as unknown as ConstructorParameters<
      typeof GatewayService
    >[0];
    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConstructorParameters<typeof GatewayService>[1];
    return new GatewayService(httpService, configService);
  }

  it('requests the /api-prefixed health path, not the bare /health path', async () => {
    const getMock = jest.fn().mockReturnValue(
      of({ status: 200 } as AxiosResponse),
    );
    const service = buildService(getMock);

    await service.checkServiceHealth('core');

    expect(getMock).toHaveBeenCalledWith(
      'http://localhost:3002/api/health',
      expect.objectContaining({ timeout: 5000 }),
    );
    expect(getMock).not.toHaveBeenCalledWith(
      'http://localhost:3002/health',
      expect.anything(),
    );
  });

  it('returns true when the /api/health endpoint responds 200', async () => {
    const getMock = jest.fn().mockReturnValue(
      of({ status: 200 } as AxiosResponse),
    );
    const service = buildService(getMock);

    await expect(service.checkServiceHealth('auth')).resolves.toBe(true);
  });
});
