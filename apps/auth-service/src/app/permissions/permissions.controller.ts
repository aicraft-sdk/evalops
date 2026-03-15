import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from '@evalops/shared-auth';

@Controller('permissions')
export class PermissionsController {
  constructor(private permissionsService: PermissionsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('check')
  async checkPermission(
    @Body()
    body: {
      userId: string;
      resourceType: string;
      resourceId?: string;
      action: string;
    },
  ) {
    return {
      hasPermission: await this.permissionsService.hasPermission(body),
    };
  }
}

