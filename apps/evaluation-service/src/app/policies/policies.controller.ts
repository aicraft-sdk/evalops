import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { PoliciesService } from './policies.service';
import {
  JwtAuthGuard,
  RbacGuard,
  Roles,
  UserRole,
  CurrentUser,
  AuthenticatedUser,
} from '@evalops/shared-auth';
import { CreatePolicyDto, UpdatePolicyDto } from './policies.dto';

@Controller('policies')
export class PoliciesController {
  constructor(private policiesService: PoliciesService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getPolicies(@CurrentUser() user: AuthenticatedUser) {
    return this.policiesService.getActivePolicies(user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('evaluate/:runId')
  async evaluateRun(@Param('runId') runId: string) {
    return this.policiesService.evaluateRun(runId);
  }

  @UseGuards(JwtAuthGuard, RbacGuard)
  @Roles(UserRole.ORG_ADMIN, UserRole.ADMIN)
  @Post()
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  )
  async createPolicy(
    @Body() dto: CreatePolicyDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.policiesService.createPolicy(
      dto,
      user.organizationId,
      user.id
    );
  }

  @UseGuards(JwtAuthGuard, RbacGuard)
  @Roles(UserRole.ORG_ADMIN, UserRole.ADMIN)
  @Put(':id')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  )
  async updatePolicy(
    @Param('id') id: string,
    @Body() dto: UpdatePolicyDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.policiesService.updatePolicy(id, dto, user.organizationId);
  }

  @UseGuards(JwtAuthGuard, RbacGuard)
  @Roles(UserRole.ORG_ADMIN, UserRole.ADMIN)
  @Delete(':id')
  async deletePolicy(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.policiesService.deletePolicy(id, user.organizationId);
  }
}
