import { Body, Controller, Post, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { JwtAuthGuard, CurrentUser, AuthenticatedUser } from '@evalops/shared-auth';
import { EntitlementGuard, RequiresEntitlement } from '@evalops/licensing';
import { PrDecorationService } from './pr-decoration.service';
import { BuildPrDecorationDto } from './pr-decoration.dto';

/**
 * `apps/evaluation-service/src/main.ts` has no global ValidationPipe — this repo's
 * evaluation-service convention is a per-route @UsePipes(new ValidationPipe(...)), matching
 * golden-sets.controller.ts / policies.controller.ts. Without this, BuildPrDecorationDto's
 * class-validator decorators would never actually be enforced at runtime.
 */
@Controller('evaluation/pr-decoration')
@UseGuards(JwtAuthGuard, EntitlementGuard)
@RequiresEntitlement('pr-decoration')
export class PrDecorationController {
  constructor(private readonly prDecorationService: PrDecorationService) {}

  @Post()
  @UsePipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  )
  build(@CurrentUser() user: AuthenticatedUser, @Body() dto: BuildPrDecorationDto) {
    return this.prDecorationService.buildDecoration(user.organizationId, dto.runId);
  }
}
