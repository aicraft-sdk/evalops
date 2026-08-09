import { Controller, Get } from '@nestjs/common';
import { Public } from '@evalops/shared-auth';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // NX-scaffold boilerplate root route (GET /api). No callers found in this
  // codebase — kept public to preserve pre-existing (unauthenticated)
  // behavior rather than silently requiring a JWT as a side effect of the
  // gateway's new global JwtAuthGuard.
  @Public()
  @Get()
  getData() {
    return this.appService.getData();
  }
}
