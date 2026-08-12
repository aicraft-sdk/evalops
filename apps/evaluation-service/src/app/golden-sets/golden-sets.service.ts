import { Injectable, NotFoundException } from '@nestjs/common';
import {
  GoldenSetsRepository,
  GoldenSet,
  GoldenSetExample,
  CalibrationRun,
} from '@evalops/shared-db';
import { CreateGoldenSetDto, AddGoldenSetExampleDto } from './golden-sets.dto';

/**
 * Explicit response projections — never return a raw repository row (or a
 * `{...row}` spread) directly from a controller. Every field returned to a
 * client is named here, not inferred from whatever columns happen to exist
 * on the table.
 */
export interface GoldenSetResponse {
  id: string;
  name: string;
  description: string | null;
  organizationId: string;
  createdBy: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface GoldenSetExampleResponse {
  id: string;
  goldenSetId: string;
  input: unknown;
  output: unknown;
  expected: unknown;
  context: unknown;
  humanLabel: boolean;
  humanReasoning: string | null;
  isBadExample: boolean;
  createdBy: string;
  organizationId: string;
  createdAt: Date | null;
}

export interface CalibrationRunResponse {
  id: string;
  goldenSetId: string;
  judgeEvaluator: string;
  judgeConfig: unknown;
  judgeThreshold: number;
  agreementRate: number;
  kappa: number | null;
  isCalibrated: boolean;
  isReliable: boolean;
  sampleCount: number;
  disagreements: unknown;
  organizationId: string;
  triggeredBy: string;
  createdAt: Date | null;
}

export function toGoldenSetResponse(row: GoldenSet): GoldenSetResponse {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    organizationId: row.organizationId,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toGoldenSetExampleResponse(
  row: GoldenSetExample,
): GoldenSetExampleResponse {
  return {
    id: row.id,
    goldenSetId: row.goldenSetId,
    input: row.input,
    output: row.output,
    expected: row.expected,
    context: row.context,
    humanLabel: row.humanLabel,
    humanReasoning: row.humanReasoning,
    isBadExample: row.isBadExample,
    createdBy: row.createdBy,
    organizationId: row.organizationId,
    createdAt: row.createdAt,
  };
}

export function toCalibrationRunResponse(
  row: CalibrationRun,
): CalibrationRunResponse {
  return {
    id: row.id,
    goldenSetId: row.goldenSetId,
    judgeEvaluator: row.judgeEvaluator,
    judgeConfig: row.judgeConfig,
    judgeThreshold: row.judgeThreshold,
    agreementRate: row.agreementRate,
    kappa: row.kappa,
    isCalibrated: row.isCalibrated,
    isReliable: row.isReliable,
    sampleCount: row.sampleCount,
    disagreements: row.disagreements,
    organizationId: row.organizationId,
    triggeredBy: row.triggeredBy,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class GoldenSetsService {
  constructor(private readonly repo: GoldenSetsRepository) {}

  async list(organizationId: string): Promise<GoldenSetResponse[]> {
    const rows = await this.repo.listGoldenSets(organizationId);
    return rows.map(toGoldenSetResponse);
  }

  async create(
    dto: CreateGoldenSetDto,
    organizationId: string,
    createdBy: string,
  ): Promise<GoldenSetResponse> {
    const row = await this.repo.createGoldenSet({
      name: dto.name,
      description: dto.description ?? null,
      organizationId,
      createdBy,
    });
    return toGoldenSetResponse(row);
  }

  async listExamples(
    id: string,
    organizationId: string,
  ): Promise<GoldenSetExampleResponse[]> {
    await this.getOwnedGoldenSet(id, organizationId);
    const rows = await this.repo.listExamples(id);
    return rows.map(toGoldenSetExampleResponse);
  }

  async addExample(
    id: string,
    dto: AddGoldenSetExampleDto,
    organizationId: string,
    createdBy: string,
  ): Promise<GoldenSetExampleResponse> {
    await this.getOwnedGoldenSet(id, organizationId);
    const row = await this.repo.addExample({
      goldenSetId: id,
      input: dto.input ?? null,
      output: dto.output,
      expected: dto.expected ?? null,
      context: dto.context ?? null,
      humanLabel: dto.humanLabel,
      humanReasoning: dto.humanReasoning ?? null,
      isBadExample: dto.isBadExample ?? false,
      createdBy,
      organizationId,
    });
    return toGoldenSetExampleResponse(row);
  }

  async listCalibrationRuns(
    id: string,
    organizationId: string,
  ): Promise<CalibrationRunResponse[]> {
    await this.getOwnedGoldenSet(id, organizationId);
    const rows = await this.repo.listCalibrationRuns(id);
    return rows.map(toCalibrationRunResponse);
  }

  /**
   * Used by GoldenSetsController before delegating to CalibrationService,
   * which does not itself org-scope its goldenSetId lookup (it reads
   * examples straight off the repository with no organizationId filter) —
   * mirrors this repo's documented cross-tenant IDOR precedent on
   * POST /policies/evaluate/:runId (see project memory), closed here instead
   * of repeated.
   */
  async verifyGoldenSetOwnership(
    id: string,
    organizationId: string,
  ): Promise<void> {
    await this.getOwnedGoldenSet(id, organizationId);
  }

  /**
   * Fetches the parent golden set and verifies it belongs to
   * organizationId, throwing NotFoundException (never leaking whether a
   * differently-owned row exists) on any mismatch or missing row. Every
   * read/write scoped by a golden-set :id must call this before touching the
   * repository — do NOT trust :id alone.
   */
  private async getOwnedGoldenSet(
    id: string,
    organizationId: string,
  ): Promise<GoldenSet> {
    const goldenSet = await this.repo.findGoldenSetById(id);
    if (!goldenSet || goldenSet.organizationId !== organizationId) {
      throw new NotFoundException(`Golden set ${id} not found`);
    }
    return goldenSet;
  }
}
