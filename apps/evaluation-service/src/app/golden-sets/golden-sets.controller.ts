import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard, CurrentUser, AuthenticatedUser } from '@evalops/shared-auth';
import { GoldenSetsService, toCalibrationRunResponse } from './golden-sets.service';
import { CalibrationService } from '../evaluation/calibration/calibration.service';
import {
  CreateGoldenSetDto,
  AddGoldenSetExampleDto,
  RunCalibrationDto,
} from './golden-sets.dto';

/**
 * Single-controller design: owns both the golden-set/example routes and the
 * nested `:id/calibration-runs` routes, delegating to the injected
 * CalibrationService. There is no separate CalibrationController class.
 */
@Controller('golden-sets')
export class GoldenSetsController {
  constructor(
    private readonly goldenSetsService: GoldenSetsService,
    private readonly calibrationService: CalibrationService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.goldenSetsService.list(user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  @UsePipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  )
  async create(
    @Body() dto: CreateGoldenSetDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.goldenSetsService.create(dto, user.organizationId, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/examples')
  async listExamples(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.goldenSetsService.listExamples(id, user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/examples')
  @UsePipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  )
  async addExample(
    @Param('id') id: string,
    @Body() dto: AddGoldenSetExampleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.goldenSetsService.addExample(id, dto, user.organizationId, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/calibration-runs')
  async listCalibrationRuns(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.goldenSetsService.listCalibrationRuns(id, user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/calibration-runs')
  @UsePipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  )
  async runCalibration(
    @Param('id') id: string,
    @Body() dto: RunCalibrationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // CalibrationService.runCalibration does not itself org-scope its
    // goldenSetId lookup (it reads examples straight off the repository with
    // no organizationId filter) — verify ownership here first, mirroring
    // this repo's own documented cross-tenant IDOR precedent on
    // POST /policies/evaluate/:runId (see project memory) rather than
    // repeating it on a newly-externally-reachable endpoint.
    await this.goldenSetsService.verifyGoldenSetOwnership(id, user.organizationId);

    const run = await this.calibrationService.runCalibration({
      goldenSetId: id,
      judgeEvaluator: dto.judgeEvaluator,
      judgeConfig: dto.judgeConfig,
      judgeThreshold: dto.judgeThreshold,
      organizationId: user.organizationId,
      triggeredBy: user.id,
    });
    return toCalibrationRunResponse(run);
  }
}
