/**
 * Type definitions for Simulation domain model
 *
 * These types define the structure for simulation suites, scenarios, and turns.
 * They are used for both database schema (via Drizzle) and API request/response DTOs.
 */

/**
 * A single turn in a simulation scenario.
 * Represents one user message and the expected agent response.
 */
export interface SimulationTurn {
  /**
   * The user message for this turn.
   * Can be a plain string or a template with variables.
   */
  userMessage: string | { template: string; variables?: Record<string, any> };

  /**
   * Tools allowed in this turn.
   * - Empty array [] = no tools allowed
   * - undefined = all tools allowed
   * - Array of strings = only these tools allowed
   */
  allowedTools?: string[];

  /**
   * Optional assertions to validate the agent's response.
   */
  assertions?: {
    /**
     * JSON schema validation for the response structure
     */
    schema?: Record<string, any>;

    /**
     * Regex pattern to match against the response content
     */
    regex?: string;

    /**
     * Tags for LLM judge rubric evaluation
     */
    rubricTags?: string[];
  };
}

/**
 * Definition of a simulation scenario.
 * Contains the turn sequence and optional metadata.
 */
export interface SimulationScenarioDefinition {
  /**
   * Array of turns that define the conversation flow.
   * The simulation executes these turns in order.
   */
  turns: SimulationTurn[];

  /**
   * Agent ID to test in this scenario
   */
  agentId: string;

  /**
   * Rules that determine when to terminate the simulation.
   */
  terminationRules?: {
    /**
     * Maximum number of turns before termination
     */
    maxTurns?: number;

    /**
     * Stop tokens that trigger termination when found in response
     */
    stopTokens?: string[];

    /**
     * Judge verdict threshold (0-1 score threshold)
     */
    judgeVerdictThreshold?: number;
  };

  /**
   * Optional metadata for the scenario (tags, categories, etc.)
   */
  metadata?: Record<string, any>;
}

/**
 * Configuration for a simulation suite.
 * Provides default settings for all scenarios in the suite.
 */
export interface SimulationSuiteConfig {
  /**
   * Default timeout for scenario execution in milliseconds
   */
  defaultTimeout?: number;

  /**
   * Retry policy for failed scenarios
   */
  retryPolicy?: {
    /**
     * Maximum number of retries
     */
    maxRetries?: number;

    /**
     * Backoff delay in milliseconds between retries
     */
    backoffMs?: number;
  };

  /**
   * Configuration for LLM judge evaluations
   */
  judgeConfig?: {
    /**
     * Model identifier (e.g., "gpt-4", "claude-3-opus")
     */
    model?: string;

    /**
     * Provider name (e.g., "openai", "anthropic")
     */
    provider?: string;

    /**
     * Temperature for judge LLM calls
     */
    temperature?: number;
  };

  /**
   * Optional metadata for the suite
   */
  metadata?: Record<string, any>;
}

/**
 * Type for SimulationSuite entity (matches database schema)
 * This will be generated from Drizzle schema in Phase 1
 */
export interface SimulationSuite {
  id: string;
  name: string;
  version: string;
  description?: string;
  config: SimulationSuiteConfig;
  organizationId: string;
  createdBy: string;
  createdAt: Date;
}

/**
 * Type for SimulationScenario entity (matches database schema)
 * This will be generated from Drizzle schema in Phase 1
 */
export interface SimulationScenario {
  id: string;
  suiteId: string;
  name: string;
  order: number;
  definition: SimulationScenarioDefinition;
  organizationId: string;
  createdAt: Date;
}

/**
 * Type for SimulationRun entity (matches database schema)
 * Links a simulation execution to a standard Run record
 * This will be generated from Drizzle schema in Phase 1
 */
export interface SimulationRun {
  id: string;
  runId: string; // Foreign key to runs.id
  suiteId: string; // Foreign key to simulation_suites.id
  scenarioId: string; // Foreign key to simulation_scenarios.id
  organizationId: string;
  createdAt: Date;
}
