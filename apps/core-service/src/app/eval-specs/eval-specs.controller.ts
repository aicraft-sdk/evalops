import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { EvalSpecsService } from './eval-specs.service';
import { JwtAuthGuard, CurrentUser } from '@evalops/shared-auth';
import { EvalSpecsRepository } from '@evalops/shared-db';
import { InsertEvalSpec } from '@evalops/shared-db';

@Controller('eval-specs')
export class EvalSpecsController {
  constructor(
    private evalSpecsService: EvalSpecsService,
    private evalSpecsRepository: EvalSpecsRepository,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getEvalSpecs(@CurrentUser() user: { organizationId: string }) {
    return this.evalSpecsRepository.findAllByOrg(user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getEvalSpec(@Param('id') id: string) {
    return this.evalSpecsRepository.findById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async createEvalSpec(
    @Body() body: InsertEvalSpec,
    @CurrentUser() user: { id: string; organizationId: string },
  ) {
    return this.evalSpecsService.createEvalSpec({
      ...body,
      organizationId: user.organizationId,
      createdBy: user.id,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async updateEvalSpec(
    @Param('id') id: string,
    @Body() body: Partial<InsertEvalSpec>,
  ) {
    return this.evalSpecsService.updateEvalSpec(id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deleteEvalSpec(@Param('id') id: string) {
    await this.evalSpecsService.deleteEvalSpec(id);
    return { message: 'Eval spec deleted successfully' };
  }
}
