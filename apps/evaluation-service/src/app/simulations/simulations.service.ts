import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { db } from '@evalops/shared-db';
import {
  simulationSuites,
  simulationScenarios,
  simulationRuns,
  type SimulationSuite,
  type InsertSimulationSuite,
  type SimulationScenario,
  type InsertSimulationScenario,
  type SimulationRun,
  type InsertSimulationRun,
} from '@evalops/shared-db';
import { eq, and, desc } from 'drizzle-orm';

/**
 * SimulationsService
 *
 * Handles CRUD operations for simulation suites and scenarios.
 */
@Injectable()
export class SimulationsService {
  private readonly logger = new Logger(SimulationsService.name);

  // ========== Suite Operations ==========

  /**
   * Create a new simulation suite
   */
  async createSuite(
    data: Omit<InsertSimulationSuite, 'organizationId' | 'createdBy'>,
    organizationId: string,
    createdBy: string
  ): Promise<SimulationSuite> {
    const suite: InsertSimulationSuite = {
      ...data,
      organizationId,
      createdBy,
      config: data.config || {},
    };

    const [created] = await db
      .insert(simulationSuites)
      .values([suite])
      .returning();

    this.logger.log(`Created simulation suite ${created.id} (${created.name})`);
    return created;
  }

  /**
   * Get all suites for an organization
   */
  async getSuites(organizationId: string): Promise<SimulationSuite[]> {
    return await db
      .select()
      .from(simulationSuites)
      .where(eq(simulationSuites.organizationId, organizationId))
      .orderBy(desc(simulationSuites.createdAt));
  }

  /**
   * Get a suite by ID
   */
  async getSuite(id: string, organizationId: string): Promise<SimulationSuite> {
    const [suite] = await db
      .select()
      .from(simulationSuites)
      .where(
        and(
          eq(simulationSuites.id, id),
          eq(simulationSuites.organizationId, organizationId)
        )
      );

    if (!suite) {
      throw new NotFoundException(`Simulation suite ${id} not found`);
    }

    return suite;
  }

  /**
   * Update a suite
   */
  async updateSuite(
    id: string,
    data: Partial<Omit<InsertSimulationSuite, 'organizationId' | 'createdBy'>>,
    organizationId: string
  ): Promise<SimulationSuite> {
    // Verify suite exists and belongs to organization
    await this.getSuite(id, organizationId);

    const [updated] = await db
      .update(simulationSuites)
      .set(data)
      .where(
        and(
          eq(simulationSuites.id, id),
          eq(simulationSuites.organizationId, organizationId)
        )
      )
      .returning();

    if (!updated) {
      throw new NotFoundException(`Simulation suite ${id} not found`);
    }

    this.logger.log(`Updated simulation suite ${id}`);
    return updated;
  }

  /**
   * Delete a suite
   */
  async deleteSuite(id: string, organizationId: string): Promise<void> {
    // Verify suite exists and belongs to organization
    await this.getSuite(id, organizationId);

    // Check if suite has scenarios
    const scenarios = await db
      .select()
      .from(simulationScenarios)
      .where(eq(simulationScenarios.suiteId, id))
      .limit(1);

    if (scenarios.length > 0) {
      throw new BadRequestException(
        `Cannot delete suite ${id}: it has ${scenarios.length} scenario(s). Delete scenarios first.`
      );
    }

    await db
      .delete(simulationSuites)
      .where(
        and(
          eq(simulationSuites.id, id),
          eq(simulationSuites.organizationId, organizationId)
        )
      );

    this.logger.log(`Deleted simulation suite ${id}`);
  }

  // ========== Scenario Operations ==========

  /**
   * Create a new scenario
   */
  async createScenario(
    suiteId: string,
    data: Omit<InsertSimulationScenario, 'suiteId' | 'organizationId'>,
    organizationId: string
  ): Promise<SimulationScenario> {
    // Verify suite exists and belongs to organization
    await this.getSuite(suiteId, organizationId);

    // Validate definition structure
    if (!data.definition || !Array.isArray(data.definition.turns)) {
      throw new BadRequestException(
        'Scenario definition must have a turns array'
      );
    }

    const scenario: InsertSimulationScenario = {
      ...data,
      suiteId,
      organizationId,
    };

    const [created] = await db
      .insert(simulationScenarios)
      .values([scenario])
      .returning();

    this.logger.log(
      `Created simulation scenario ${created.id} (${created.name}) in suite ${suiteId}`
    );
    return created;
  }

  /**
   * Get all scenarios for a suite
   */
  async getScenariosForSuite(
    suiteId: string,
    organizationId: string
  ): Promise<SimulationScenario[]> {
    // Verify suite exists
    await this.getSuite(suiteId, organizationId);

    return await db
      .select()
      .from(simulationScenarios)
      .where(
        and(
          eq(simulationScenarios.suiteId, suiteId),
          eq(simulationScenarios.organizationId, organizationId)
        )
      )
      .orderBy(simulationScenarios.order);
  }

  /**
   * Get a scenario by ID
   */
  async getScenario(
    id: string,
    organizationId: string
  ): Promise<SimulationScenario> {
    const [scenario] = await db
      .select()
      .from(simulationScenarios)
      .where(
        and(
          eq(simulationScenarios.id, id),
          eq(simulationScenarios.organizationId, organizationId)
        )
      );

    if (!scenario) {
      throw new NotFoundException(`Simulation scenario ${id} not found`);
    }

    return scenario;
  }

  /**
   * Update a scenario
   */
  async updateScenario(
    id: string,
    data: Partial<Omit<InsertSimulationScenario, 'suiteId' | 'organizationId'>>,
    organizationId: string
  ): Promise<SimulationScenario> {
    // Verify scenario exists and belongs to organization
    await this.getScenario(id, organizationId);

    const [updated] = await db
      .update(simulationScenarios)
      .set(data)
      .where(
        and(
          eq(simulationScenarios.id, id),
          eq(simulationScenarios.organizationId, organizationId)
        )
      )
      .returning();

    if (!updated) {
      throw new NotFoundException(`Simulation scenario ${id} not found`);
    }

    this.logger.log(`Updated simulation scenario ${id}`);
    return updated;
  }

  /**
   * Delete a scenario
   */
  async deleteScenario(id: string, organizationId: string): Promise<void> {
    // Verify scenario exists and belongs to organization
    await this.getScenario(id, organizationId);

    await db
      .delete(simulationScenarios)
      .where(
        and(
          eq(simulationScenarios.id, id),
          eq(simulationScenarios.organizationId, organizationId)
        )
      );

    this.logger.log(`Deleted simulation scenario ${id}`);
  }

  // ========== Simulation Run Operations ==========

  /**
   * Create a simulation run record (links a Run to a scenario)
   */
  async createSimulationRun(
    runId: string,
    suiteId: string,
    scenarioId: string,
    organizationId: string
  ): Promise<SimulationRun> {
    // Verify suite and scenario exist
    await this.getSuite(suiteId, organizationId);
    await this.getScenario(scenarioId, organizationId);

    const simulationRun: InsertSimulationRun = {
      runId,
      suiteId,
      scenarioId,
      organizationId,
    };

    const [created] = await db
      .insert(simulationRuns)
      .values([simulationRun])
      .returning();

    this.logger.log(
      `Created simulation run ${created.id} linking run ${runId} to scenario ${scenarioId}`
    );
    return created;
  }

  /**
   * Get simulation run by run ID
   */
  async getSimulationRunByRunId(
    runId: string,
    organizationId: string
  ): Promise<SimulationRun | null> {
    const [simulationRun] = await db
      .select()
      .from(simulationRuns)
      .where(
        and(
          eq(simulationRuns.runId, runId),
          eq(simulationRuns.organizationId, organizationId)
        )
      );

    return simulationRun || null;
  }

  /**
   * Get all simulation runs for a suite
   */
  async getSimulationRunsForSuite(
    suiteId: string,
    organizationId: string
  ): Promise<SimulationRun[]> {
    return await db
      .select()
      .from(simulationRuns)
      .where(
        and(
          eq(simulationRuns.suiteId, suiteId),
          eq(simulationRuns.organizationId, organizationId)
        )
      )
      .orderBy(desc(simulationRuns.createdAt));
  }
}
