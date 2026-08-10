import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '@evalops/shared-auth';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let app: TestingModule;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();
  });

  describe('getData', () => {
    it('should return "Hello API"', () => {
      const appController = app.get<AppController>(AppController);
      expect(appController.getData()).toEqual({ message: 'Hello API' });
    });

    // NX-scaffold boilerplate root route (GET /api) has no callers in this
    // codebase (grep confirms only its own spec references AppController/
    // AppService) — it must stay reachable without a JWT so it doesn't
    // silently start requiring auth as a side effect of the global
    // JwtAuthGuard added in this phase.
    it('is exempt from JWT auth (@Public)', () => {
      const reflector = new Reflector();
      const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        AppController.prototype.getData,
        AppController,
      ]);

      expect(isPublic).toBe(true);
    });
  });
});
