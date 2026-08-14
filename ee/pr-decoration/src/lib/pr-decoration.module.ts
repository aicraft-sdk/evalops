import { Module } from '@nestjs/common';
import { PrDecorationController } from './pr-decoration.controller';
import { PrDecorationService } from './pr-decoration.service';

// RUN_LOOKUP is bound by the consuming app (apps/evaluation-service) to its RunsService,
// mirroring the SSO_USER_PROVISIONER pattern used by ee/sso's AuthModule.
@Module({ controllers: [PrDecorationController], providers: [PrDecorationService] })
export class PrDecorationModule {}
