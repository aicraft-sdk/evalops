/**
 * RED phase: verify repository contracts exist + SharedDbModule is importable.
 * These tests import the not-yet-created files — they must fail until the
 * implementations are written.
 */

// Importing non-existent modules should cause module-not-found compile errors.
// This is the RED test: if any import below resolves, the file already existed.
import { UsersRepository } from './users.repository';
import { OrganizationsRepository } from './organizations.repository';
import { PermissionsRepository } from './permissions.repository';
import { PromptsRepository } from './prompts.repository';
import { DatasetsRepository } from './datasets.repository';
import { EvalSpecsRepository } from './eval-specs.repository';
import { ProvidersRepository } from './providers.repository';
import { ModelsRepository } from './models.repository';
import { AgentsRepository } from './agents.repository';
import { RunsRepository } from './runs.repository';
import { SampleResultsRepository } from './sample-results.repository';
import { ReviewQueueRepository } from './review-queue.repository';
import { CustomEvaluatorsRepository } from './custom-evaluators.repository';
import { CicdRepository } from './cicd.repository';
import { AlertsRepository } from './alerts.repository';
import { AuditRepository } from './audit.repository';
import { MetricsRepository } from './metrics.repository';
import { SharedDbModule } from '../shared-db.module';

describe('Repository contracts', () => {
  it('UsersRepository is a class', () => {
    expect(typeof UsersRepository).toBe('function');
  });

  it('OrganizationsRepository is a class', () => {
    expect(typeof OrganizationsRepository).toBe('function');
  });

  it('PermissionsRepository is a class', () => {
    expect(typeof PermissionsRepository).toBe('function');
  });

  it('PromptsRepository is a class', () => {
    expect(typeof PromptsRepository).toBe('function');
  });

  it('DatasetsRepository is a class', () => {
    expect(typeof DatasetsRepository).toBe('function');
  });

  it('EvalSpecsRepository is a class', () => {
    expect(typeof EvalSpecsRepository).toBe('function');
  });

  it('ProvidersRepository is a class', () => {
    expect(typeof ProvidersRepository).toBe('function');
  });

  it('ModelsRepository is a class', () => {
    expect(typeof ModelsRepository).toBe('function');
  });

  it('AgentsRepository is a class', () => {
    expect(typeof AgentsRepository).toBe('function');
  });

  it('RunsRepository is a class', () => {
    expect(typeof RunsRepository).toBe('function');
  });

  it('SampleResultsRepository is a class', () => {
    expect(typeof SampleResultsRepository).toBe('function');
  });

  it('ReviewQueueRepository is a class', () => {
    expect(typeof ReviewQueueRepository).toBe('function');
  });

  it('CustomEvaluatorsRepository is a class', () => {
    expect(typeof CustomEvaluatorsRepository).toBe('function');
  });

  it('CicdRepository is a class', () => {
    expect(typeof CicdRepository).toBe('function');
  });

  it('AlertsRepository is a class', () => {
    expect(typeof AlertsRepository).toBe('function');
  });

  it('AuditRepository is a class', () => {
    expect(typeof AuditRepository).toBe('function');
  });

  it('MetricsRepository is a class', () => {
    expect(typeof MetricsRepository).toBe('function');
  });

  it('SharedDbModule is a class', () => {
    expect(typeof SharedDbModule).toBe('function');
  });
});
