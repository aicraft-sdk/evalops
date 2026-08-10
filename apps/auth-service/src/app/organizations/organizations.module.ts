import { Module } from '@nestjs/common';
import { RedisModule } from '@evalops/shared-common';
import { RateLimitGuard } from '@evalops/shared-auth';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [RedisModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, RateLimitGuard],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}

