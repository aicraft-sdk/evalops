import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { SimulationsService } from './simulations.service';
import { TraceWriterService } from './trace-writer.service';
import { SimulationRunnerService } from './simulation-runner.service';
import { JwtAuthGuard, CurrentUser } from '@evalops/shared-auth';
import { extractTokenFromRequest } from '@evalops/shared-common';
import {
  InsertSimulationSuite,
  InsertSimulationScenario,
} from '@evalops/shared-db';

@Controller('simulations')
export class SimulationsController {
  constructor(
    private simulationsService: SimulationsService,
    private traceWriterService: TraceWriterService,
    private simulationRunner: SimulationRunnerService
  ) {}

  // ========== Suite Endpoints ==========

  @UseGuards(JwtAuthGuard)
  @Post('suites')
  async createSuite(
    @Body() body: Omit<InsertSimulationSuite, 'organizationId' | 'createdBy'>,
    @CurrentUser() user: any
  ) {
    return this.simulationsService.createSuite(
      body,
      user.organizationId,
      user.id
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('suites')
  async getSuites(@CurrentUser() user: any) {
    return this.simulationsService.getSuites(user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('suites/:id')
  async getSuite(@Param('id') id: string, @CurrentUser() user: any) {
    return this.simulationsService.getSuite(id, user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Put('suites/:id')
  async updateSuite(
    @Param('id') id: string,
    @Body()
    body: Partial<Omit<InsertSimulationSuite, 'organizationId' | 'createdBy'>>,
    @CurrentUser() user: any
  ) {
    return this.simulationsService.updateSuite(id, body, user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('suites/:id')
  async deleteSuite(@Param('id') id: string, @CurrentUser() user: any) {
    await this.simulationsService.deleteSuite(id, user.organizationId);
    return { message: 'Suite deleted successfully' };
  }

  // ========== Scenario Endpoints ==========

  @UseGuards(JwtAuthGuard)
  @Post('suites/:suiteId/scenarios')
  async createScenario(
    @Param('suiteId') suiteId: string,
    @Body() body: Omit<InsertSimulationScenario, 'suiteId' | 'organizationId'>,
    @CurrentUser() user: any
  ) {
    return this.simulationsService.createScenario(
      suiteId,
      body,
      user.organizationId
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('suites/:suiteId/scenarios')
  async getScenarios(
    @Param('suiteId') suiteId: string,
    @CurrentUser() user: any
  ) {
    return this.simulationsService.getScenariosForSuite(
      suiteId,
      user.organizationId
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('scenarios/:id')
  async getScenario(@Param('id') id: string, @CurrentUser() user: any) {
    return this.simulationsService.getScenario(id, user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Put('scenarios/:id')
  async updateScenario(
    @Param('id') id: string,
    @Body()
    body: Partial<Omit<InsertSimulationScenario, 'suiteId' | 'organizationId'>>,
    @CurrentUser() user: any
  ) {
    return this.simulationsService.updateScenario(
      id,
      body,
      user.organizationId
    );
  }

  @UseGuards(JwtAuthGuard)
  @Delete('scenarios/:id')
  async deleteScenario(@Param('id') id: string, @CurrentUser() user: any) {
    await this.simulationsService.deleteScenario(id, user.organizationId);
    return { message: 'Scenario deleted successfully' };
  }

  // ========== Run Endpoints ==========

  @UseGuards(JwtAuthGuard)
  @Get('runs/:runId')
  async getSimulationRun(
    @Param('runId') runId: string,
    @CurrentUser() user: any
  ) {
    const simulationRun = await this.simulationsService.getSimulationRunByRunId(
      runId,
      user.organizationId
    );
    if (!simulationRun) {
      return null;
    }

    // Return with suite and scenario details
    const suite = await this.simulationsService.getSuite(
      simulationRun.suiteId,
      user.organizationId
    );
    const scenario = await this.simulationsService.getScenario(
      simulationRun.scenarioId,
      user.organizationId
    );

    return {
      ...simulationRun,
      suite,
      scenario,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('scenarios/:scenarioId/run')
  async executeScenario(
    @Param('scenarioId') scenarioId: string,
    @CurrentUser() user: any,
    @Request() req: any,
    @Body() body?: { commitSha?: string }
  ) {
    const token = extractTokenFromRequest(req);
    return this.simulationRunner.executeScenario(
      scenarioId,
      user.organizationId,
      user.id,
      token,
      body?.commitSha
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('suites/:suiteId/run')
  async runSuite(
    @Param('suiteId') suiteId: string,
    @CurrentUser() user: any,
    @Request() req: any,
    @Body() body?: { commitSha?: string }
  ) {
    const token = extractTokenFromRequest(req);
    const suite = await this.simulationsService.getSuite(
      suiteId,
      user.organizationId
    );
    const scenarios = await this.simulationsService.getScenariosForSuite(
      suiteId,
      user.organizationId
    );

    // Execute all scenarios in order
    const runs = [];
    for (const scenario of scenarios.sort((a, b) => a.order - b.order)) {
      const run = await this.simulationRunner.executeScenario(
        scenario.id,
        user.organizationId,
        user.id,
        token,
        body?.commitSha
      );
      runs.push(run);
    }

    return { suite, runs };
  }

  @UseGuards(JwtAuthGuard)
  @Get('runs/:runId/spans')
  async getSpans(@Param('runId') runId: string, @CurrentUser() user: any) {
    // Verify simulation run exists
    const simulationRun = await this.simulationsService.getSimulationRunByRunId(
      runId,
      user.organizationId
    );
    if (!simulationRun) {
      return [];
    }

    // Get spans for this run
    return this.traceWriterService.getSpansForRun(runId);
  }
}
