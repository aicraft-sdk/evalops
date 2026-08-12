import { Module, Global } from '@nestjs/common';
import { UsersRepository } from './repositories/users.repository';
import { OrganizationsRepository } from './repositories/organizations.repository';
import { PermissionsRepository } from './repositories/permissions.repository';
import { FlowsRepository } from './repositories/flows.repository';
import { PromptsRepository } from './repositories/prompts.repository';
import { DatasetsRepository } from './repositories/datasets.repository';
import { EvalSpecsRepository } from './repositories/eval-specs.repository';
import { ProvidersRepository } from './repositories/providers.repository';
import { ModelsRepository } from './repositories/models.repository';
import { AgentsRepository } from './repositories/agents.repository';
import { RunsRepository } from './repositories/runs.repository';
import { SampleResultsRepository } from './repositories/sample-results.repository';
import { ReviewQueueRepository } from './repositories/review-queue.repository';
import { CustomEvaluatorsRepository } from './repositories/custom-evaluators.repository';
import { CicdRepository } from './repositories/cicd.repository';
import { AlertsRepository } from './repositories/alerts.repository';
import { AuditRepository } from './repositories/audit.repository';
import { MetricsRepository } from './repositories/metrics.repository';
import { PersonalAccessTokensRepository } from './repositories/personal-access-tokens.repository';
import { JudgeCacheRepository } from './repositories/judge-cache.repository';
import { GoldenSetsRepository } from './repositories/golden-sets.repository';

const REPOSITORIES = [
  UsersRepository,
  OrganizationsRepository,
  PermissionsRepository,
  FlowsRepository,
  PromptsRepository,
  DatasetsRepository,
  EvalSpecsRepository,
  ProvidersRepository,
  ModelsRepository,
  AgentsRepository,
  RunsRepository,
  SampleResultsRepository,
  ReviewQueueRepository,
  CustomEvaluatorsRepository,
  CicdRepository,
  AlertsRepository,
  AuditRepository,
  MetricsRepository,
  PersonalAccessTokensRepository,
  JudgeCacheRepository,
  GoldenSetsRepository,
];

@Global()
@Module({
  providers: REPOSITORIES,
  exports: REPOSITORIES,
})
export class SharedDbModule {}
