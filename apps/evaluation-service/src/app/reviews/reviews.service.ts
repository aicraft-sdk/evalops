import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { RunsRepository, SampleResultsRepository, ReviewQueueRepository } from '@evalops/shared-db';
import { CoreClientService } from '../core-client/core-client.service';
import {
  RunAnnotation,
  InsertRunAnnotation,
  ReviewQueueItem,
  InsertReviewQueueItem,
  Run,
  SampleResult,
  TraceSpan,
} from '@evalops/shared-db';
import { db } from '@evalops/shared-db';
import {
  traceSpans,
  sampleResults,
  reviewQueueItems,
} from '@evalops/shared-db';
import { eq, and } from 'drizzle-orm';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private runsRepository: RunsRepository,
    private sampleResultsRepository: SampleResultsRepository,
    private reviewQueueRepository: ReviewQueueRepository,
    private coreClient: CoreClientService
  ) {}

  // ========== Annotation Operations ==========

  async createAnnotation(
    data: Omit<InsertRunAnnotation, 'organizationId' | 'authorId'>,
    organizationId: string,
    authorId: string
  ): Promise<RunAnnotation> {
    // Verify run exists
    const run = await this.runsRepository.findById(data.runId);
    if (!run) {
      throw new NotFoundException(`Run ${data.runId} not found`);
    }

    if (run.organizationId !== organizationId) {
      throw new NotFoundException(`Run ${data.runId} not found`);
    }

    // If spanId is provided, verify it exists
    if (data.spanId) {
      const [span] = await db
        .select()
        .from(traceSpans)
        .where(
          and(
            eq(traceSpans.spanId, data.spanId),
            eq(traceSpans.runId, data.runId)
          )
        );
      if (!span) {
        throw new NotFoundException(
          `Span ${data.spanId} not found for run ${data.runId}`
        );
      }
    }

    const annotation: InsertRunAnnotation = {
      ...data,
      organizationId,
      authorId,
      tags: data.tags || [],
      linkTargets: data.linkTargets || [],
    };

    const created = await this.sampleResultsRepository.createAnnotation(annotation);

    // Optionally create a review queue item if this is a failure annotation
    if (
      data.label === 'bug' ||
      data.label === 'regression' ||
      data.severity === 'high' ||
      data.severity === 'critical'
    ) {
      await this.createQueueItemFromAnnotation(
        created,
        organizationId,
        authorId
      );
    }

    return created;
  }

  async getAnnotation(
    id: string,
    organizationId: string
  ): Promise<RunAnnotation> {
    const annotation = await this.sampleResultsRepository.findAnnotationById(id);
    if (!annotation || annotation.organizationId !== organizationId) {
      throw new NotFoundException(`Annotation ${id} not found`);
    }
    return annotation;
  }

  async getAnnotationsForRun(
    runId: string,
    organizationId: string,
    spanId?: string
  ): Promise<RunAnnotation[]> {
    // Verify run exists and belongs to organization
    const run = await this.runsRepository.findById(runId);
    if (!run || run.organizationId !== organizationId) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    return await this.sampleResultsRepository.findAnnotationsForRun(runId, spanId);
  }

  async updateAnnotation(
    id: string,
    data: Partial<InsertRunAnnotation>,
    organizationId: string
  ): Promise<RunAnnotation> {
    const annotation = await this.getAnnotation(id, organizationId);
    return await this.sampleResultsRepository.updateAnnotation(id, data);
  }

  async deleteAnnotation(id: string, organizationId: string): Promise<void> {
    await this.getAnnotation(id, organizationId); // Verify exists and belongs to org
    await this.sampleResultsRepository.deleteAnnotation(id);
  }

  // ========== Review Queue Operations ==========

  async createQueueItem(
    data: Omit<InsertReviewQueueItem, 'organizationId' | 'createdBy'>,
    organizationId: string,
    createdBy: string
  ): Promise<ReviewQueueItem> {
    // Verify run exists
    const run = await this.runsRepository.findById(data.runId);
    if (!run || run.organizationId !== organizationId) {
      throw new NotFoundException(`Run ${data.runId} not found`);
    }

    // Verify annotation exists if provided
    if (data.annotationId) {
      const annotation = await this.sampleResultsRepository.findAnnotationById(
        data.annotationId
      );
      if (!annotation || annotation.organizationId !== organizationId) {
        throw new NotFoundException(
          `Annotation ${data.annotationId} not found`
        );
      }
    }

    const item: InsertReviewQueueItem = {
      ...data,
      organizationId,
      createdBy,
      tags: data.tags || [],
    };

    return await this.reviewQueueRepository.create(item);
  }

  async createQueueItemFromAnnotation(
    annotation: RunAnnotation,
    organizationId: string,
    createdBy: string
  ): Promise<ReviewQueueItem> {
    // Check if queue item already exists for this annotation
    const existing = await db
      .select()
      .from(reviewQueueItems)
      .where(eq(reviewQueueItems.annotationId, annotation.id))
      .limit(1);

    if (existing.length > 0) {
      return existing[0];
    }

    return await this.createQueueItem(
      {
        runId: annotation.runId,
        annotationId: annotation.id,
        sourceType: 'annotation',
        sourceId: annotation.id,
        priority: this.severityToPriority(annotation.severity),
        tags: annotation.tags as string[],
      },
      organizationId,
      createdBy
    );
  }

  async createQueueItemFromPolicyViolation(
    runId: string,
    policyViolationId: string,
    organizationId: string,
    createdBy: string
  ): Promise<ReviewQueueItem> {
    // Check if queue item already exists for this violation
    const existing = await db
      .select()
      .from(reviewQueueItems)
      .where(
        and(
          eq(reviewQueueItems.runId, runId),
          eq(reviewQueueItems.sourceType, 'policy_violation'),
          eq(reviewQueueItems.sourceId, policyViolationId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return existing[0];
    }

    // Check if run has commitSha (indicating CI run) and add ci_gate tag
    const run = await this.runsRepository.findById(runId);
    const tags: string[] = [];
    if (run?.commitSha) {
      tags.push('ci_gate');
    }

    return await this.createQueueItem(
      {
        runId,
        sourceType: 'policy_violation',
        sourceId: policyViolationId,
        priority: 'high', // Policy violations are typically high priority
        tags,
      },
      organizationId,
      createdBy
    );
  }

  async getQueueItem(
    id: string,
    organizationId: string
  ): Promise<ReviewQueueItem> {
    const item = await this.reviewQueueRepository.findById(id);
    if (!item || item.organizationId !== organizationId) {
      throw new NotFoundException(`Review queue item ${id} not found`);
    }
    return item;
  }

  async getQueueItems(
    organizationId: string,
    filters?: {
      status?: string;
      priority?: string;
      assigneeId?: string;
      sourceType?: string;
      tags?: string[];
    },
    limit?: number
  ): Promise<ReviewQueueItem[]> {
    return await this.reviewQueueRepository.findByOrg(
      organizationId,
      filters,
      limit
    );
  }

  async updateQueueItem(
    id: string,
    data: Partial<InsertReviewQueueItem>,
    organizationId: string
  ): Promise<ReviewQueueItem> {
    await this.getQueueItem(id, organizationId); // Verify exists and belongs to org
    return await this.reviewQueueRepository.update(id, data);
  }

  // ========== Promote Operations ==========

  async promoteToDataset(
    queueItemId: string,
    datasetId: string | null,
    datasetName: string | null,
    organizationId: string,
    authToken?: string
  ): Promise<{ datasetId: string; sampleIndex: number }> {
    const queueItem = await this.getQueueItem(queueItemId, organizationId);
    const run = await this.runsRepository.findById(queueItem.runId);
    if (!run) {
      throw new NotFoundException(`Run ${queueItem.runId} not found`);
    }

    // Extract sample data from run
    let input: unknown;
    let expectedOutput: unknown;

    if (queueItem.annotationId) {
      // If there's an annotation with a spanId, extract from that span
      const annotation = await this.sampleResultsRepository.findAnnotationById(
        queueItem.annotationId
      );
      if (annotation?.spanId) {
        const [span] = await db
          .select()
          .from(traceSpans)
          .where(
            and(
              eq(traceSpans.spanId, annotation.spanId),
              eq(traceSpans.runId, run.id)
            )
          );
        if (span) {
          // Extract from span attributes
          const attrs = span.attributes as Record<string, unknown>;
          input = attrs?.['input'] || attrs?.['user_message'] || attrs?.['message'];
          expectedOutput = attrs?.['expected_output'] || attrs?.['expected'];
        }
      }
    }

    // Fallback: extract from sampleResults
    if (!input) {
      const samples = await this.sampleResultsRepository.findByRun(run.id);
      if (samples.length > 0) {
        const sample = samples[0]; // Use first sample
        input = sample.input;
        expectedOutput = sample.expectedOutput;
      } else {
        throw new BadRequestException(
          `Cannot extract sample data from run ${run.id}`
        );
      }
    }

    // Get or create dataset
    let targetDatasetId = datasetId;
    if (!targetDatasetId) {
      if (!datasetName) {
        throw new BadRequestException(
          'Either datasetId or datasetName must be provided'
        );
      }
      // Create new dataset via core-service
      // Note: This would require adding a createDataset method to CoreClientService
      // For now, we'll require datasetId to be provided
      throw new BadRequestException(
        'Creating new datasets via promote is not yet supported. Please provide an existing datasetId.'
      );
    }

    // Verify dataset exists and belongs to organization
    const dataset = await this.coreClient.getDataset(
      targetDatasetId,
      authToken
    );
    if (!dataset || dataset.organizationId !== organizationId) {
      throw new NotFoundException(`Dataset ${targetDatasetId} not found`);
    }

    // Get current samples to determine next index
    const existingSamples = await this.coreClient.getDatasetSamples(
      targetDatasetId,
      authToken
    );
    const sampleIndex = existingSamples.length;

    // Add sample to dataset via core-service
    // Note: This would require adding an addSample method to CoreClientService
    // For now, we'll update the queue item to track the promotion
    await this.reviewQueueRepository.update(queueItemId, {
      status: 'promoted',
      promotedToDatasetId: targetDatasetId,
    });

    this.logger.log(
      `Promoted queue item ${queueItemId} to dataset ${targetDatasetId} (sample index ${sampleIndex})`
    );

    return { datasetId: targetDatasetId, sampleIndex };
  }

  async promoteToScenario(
    queueItemId: string,
    suiteId: string,
    scenarioId: string | null,
    scenarioName: string | null,
    organizationId: string,
    authToken?: string
  ): Promise<{ scenarioId: string }> {
    const queueItem = await this.getQueueItem(queueItemId, organizationId);
    const run = await this.runsRepository.findById(queueItem.runId);
    if (!run) {
      throw new NotFoundException(`Run ${queueItem.runId} not found`);
    }

    // Extract turn sequence from trace spans
    const spans = await db
      .select()
      .from(traceSpans)
      .where(eq(traceSpans.runId, run.id))
      .orderBy(traceSpans.startTime);

    // Filter for simulation.turn spans
    const turnSpans = spans.filter(
      (span) => (span.attributes as Record<string, unknown>)?.['simulation'] !== undefined &&
        typeof (span.attributes as Record<string, unknown>)?.['simulation'] === 'object' &&
        (span.attributes as Record<string, Record<string, unknown>>)?.['simulation']?.['turn'] !== undefined
    );

    if (turnSpans.length === 0) {
      throw new BadRequestException(
        `Cannot extract turn sequence from run ${run.id}`
      );
    }

    // Build turn definitions from spans
    const turns = turnSpans.map((span) => {
      const attrs = span.attributes as Record<string, unknown>;
      return {
        role: (attrs?.['role'] as string) || 'user',
        content: attrs?.['content'] || attrs?.['message'] || attrs?.['user_message'],
        metadata: (attrs?.['metadata'] as Record<string, unknown>) || {},
      };
    });

    // Create or update scenario
    // Note: This would require adding scenario methods to CoreClientService
    // For now, we'll update the queue item to track the promotion
    const targetScenarioId = scenarioId || 'new-scenario-id'; // Placeholder

    await this.reviewQueueRepository.update(queueItemId, {
      status: 'promoted',
      promotedToScenarioId: targetScenarioId,
    });

    this.logger.log(
      `Promoted queue item ${queueItemId} to scenario ${targetScenarioId}`
    );

    return { scenarioId: targetScenarioId };
  }

  // ========== Helper Methods ==========

  private severityToPriority(severity: string): string {
    switch (severity) {
      case 'critical':
        return 'urgent';
      case 'high':
        return 'high';
      case 'medium':
        return 'medium';
      case 'low':
        return 'low';
      default:
        return 'medium';
    }
  }
}
