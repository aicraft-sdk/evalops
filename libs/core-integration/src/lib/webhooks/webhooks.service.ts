import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import * as crypto from 'crypto';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { CicdRepository } from '@evalops/shared-db';
import { CicdRun } from '@evalops/shared-db';
import { EvaluationClientService } from '../evaluation-client/evaluation-client.service';

/** Shape of a CI/CD integration's `config` jsonb column, as used by this service. */
interface CicdIntegrationConfig {
  autoTriggerEvaluations?: boolean;
  defaultEvalSpecId?: string;
  repository?: string;
  githubToken?: string;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Narrow a jsonb `metadata` column value to a spreadable record. */
function asMetadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export interface GitHubPushPayload {
  ref: string;
  repository: {
    name: string;
    full_name: string;
    clone_url: string;
  };
  head_commit: {
    id: string;
    message: string;
    author: {
      name: string;
      email: string;
    };
  };
  pusher: {
    name: string;
    email: string;
  };
}

export interface GitHubPullRequestPayload {
  action: string;
  number: number;
  pull_request: {
    id: number;
    number: number;
    title: string;
    head: {
      ref: string;
      sha: string;
    };
    base: {
      ref: string;
    };
  };
  repository: {
    name: string;
    full_name: string;
  };
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private cicdRepository: CicdRepository,
    private httpService: HttpService,
    private evaluationClient: EvaluationClientService,
    @InjectQueue('webhook-delivery') private webhookQueue: Queue,
  ) {}

  verifyGitHubSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload, 'utf8')
        .digest('hex');

      const providedSignature = signature.startsWith('sha256=')
        ? signature.slice(7)
        : signature;

      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(providedSignature, 'hex')
      );
    } catch (error) {
      this.logger.error('Error verifying GitHub signature:', error);
      return false;
    }
  }

  async processPushWebhook(
    integrationId: string,
    payload: GitHubPushPayload,
    organizationId: string
  ): Promise<void> {
    // Check if this is a push to main/master branch
    const isMainBranch =
      payload.ref === 'refs/heads/main' || payload.ref === 'refs/heads/master';

    if (isMainBranch) {
      // Atomically create the webhook event and its CI/CD run so neither
      // record is left orphaned if the second write fails.
      const cicdRunData = {
        integrationId,
        externalRunId: `push-${payload.head_commit.id}`,
        branch: payload.ref.replace('refs/heads/', ''),
        commit: payload.head_commit.id,
        status: 'pending' as const,
        startedAt: new Date(),
        metadata: {
          commitMessage: payload.head_commit.message,
          author: payload.head_commit.author,
          pusher: payload.pusher,
        },
        organizationId,
      };

      const { run: cicdRun } =
        await this.cicdRepository.createRunWithWebhookEvent(
          {
            integrationId,
            eventType: 'push',
            payload,
            organizationId,
          },
          cicdRunData,
        );

      // Trigger evaluation run based on integration configuration
      await this.triggerEvaluationRun(integrationId, cicdRun, organizationId);
    } else {
      // Non-main-branch push: record the event only (no CI/CD run needed)
      const webhookEvent = {
        integrationId,
        eventType: 'push',
        payload,
        organizationId,
      };
      await this.cicdRepository.createWebhookEvent(webhookEvent);
    }
  }

  async processPullRequestWebhook(
    integrationId: string,
    payload: GitHubPullRequestPayload,
    organizationId: string
  ): Promise<void> {
    // Only process opened and synchronize actions (these create CI/CD runs)
    if (['opened', 'synchronize'].includes(payload.action)) {
      // Atomically create the webhook event and its CI/CD run so neither
      // record is left orphaned if the second write fails.
      const cicdRunData = {
        integrationId,
        externalRunId: `pr-${payload.pull_request.number}-${payload.pull_request.head.sha}`,
        branch: payload.pull_request.head.ref,
        commit: payload.pull_request.head.sha,
        pullRequestNumber: payload.pull_request.number,
        status: 'pending' as const,
        startedAt: new Date(),
        metadata: {
          prTitle: payload.pull_request.title,
          prNumber: payload.pull_request.number,
          action: payload.action,
        },
        organizationId,
      };

      const { run: cicdRun } =
        await this.cicdRepository.createRunWithWebhookEvent(
          {
            integrationId,
            eventType: 'pull_request',
            payload,
            organizationId,
          },
          cicdRunData,
        );

      // Trigger evaluation run for PR
      await this.triggerEvaluationRun(integrationId, cicdRun, organizationId);
    } else {
      // Other PR actions (closed, labeled, etc.): record event only
      const webhookEvent = {
        integrationId,
        eventType: 'pull_request',
        payload,
        organizationId,
      };
      await this.cicdRepository.createWebhookEvent(webhookEvent);
    }
  }

  private async triggerEvaluationRun(
    integrationId: string,
    cicdRun: CicdRun,
    organizationId: string
  ): Promise<void> {
    try {
      // Get integration configuration
      const integration = await this.cicdRepository.findIntegrationById(
        integrationId,
      );
      if (!integration || !integration.config) {
        throw new Error('Integration configuration not found');
      }

      const config = integration.config as CicdIntegrationConfig;

      // Check if auto-trigger is enabled
      if (!config.autoTriggerEvaluations) {
        this.logger.log(
          `Auto-trigger disabled for integration: ${integrationId}`
        );
        return;
      }

      // Get the evaluation spec to run
      const evalSpecId = config.defaultEvalSpecId;
      if (!evalSpecId) {
        this.logger.log(
          `No default eval spec configured for integration: ${integrationId}`
        );
        return;
      }

      if (!cicdRun.commit) {
        throw new Error(`CI/CD run ${cicdRun.id} is missing a commit SHA`);
      }

      // Create evaluation run via Evaluation Service
      const runName = `CI/CD: ${cicdRun.branch} - ${cicdRun.commit.substring(
        0,
        7
      )}`;
      const evaluationRun = await this.evaluationClient.createRun(
        evalSpecId,
        runName,
        cicdRun.commit,
        organizationId,
        'system', // System-triggered run
        undefined // No auth token for system calls (or implement service-to-service auth)
      );

      this.logger.log('Created evaluation run:', {
        integrationId,
        evalSpecId,
        cicdRunId: cicdRun.id,
        runId: evaluationRun.id,
        branch: cicdRun.branch,
        commit: cicdRun.commit,
      });

      // Update CI/CD run status and link to evaluation run
      await this.cicdRepository.updateRun(cicdRun.id, {
        status: 'running',
        runId: evaluationRun.id,
        metadata: {
          ...asMetadataRecord(cicdRun.metadata),
          evaluationRunId: evaluationRun.id,
        },
      });
    } catch (error: unknown) {
      this.logger.error('Failed to trigger evaluation run:', error);

      // Update CI/CD run with failure
      await this.cicdRepository.updateRun(cicdRun.id, {
        status: 'failure',
        completedAt: new Date(),
        metadata: {
          ...asMetadataRecord(cicdRun.metadata),
          error: getErrorMessage(error) || 'Unknown error',
        },
      });
    }
  }

  async deliverWebhook(
    url: string,
    payload: unknown,
    secret?: string
  ): Promise<void> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Add signature if secret provided
      if (secret) {
        const signature = crypto
          .createHmac('sha256', secret)
          .update(JSON.stringify(payload), 'utf8')
          .digest('hex');
        headers['X-Webhook-Signature'] = `sha256=${signature}`;
      }

      await firstValueFrom(this.httpService.post(url, payload, { headers }));

      this.logger.log(`Successfully delivered webhook to ${url}`);
    } catch (error: unknown) {
      this.logger.error(`Failed to deliver webhook to ${url}:`, error);
      throw error;
    }
  }

  async queueWebhookDelivery(
    url: string,
    payload: unknown,
    options?: { attempts?: number; delay?: number; organizationId?: string }
  ): Promise<void> {
    await this.webhookQueue.add(
      'deliver',
      { url, payload, organizationId: options?.organizationId ?? '' },
      {
        attempts: options?.attempts || 3,
        backoff: {
          type: 'exponential',
          delay: options?.delay || 1000,
        },
      }
    );
  }

  async reportStatus(
    cicdRunId: string,
    status: 'success' | 'failure',
    qualityGateResult?: 'pass' | 'warn' | 'fail',
    runId?: string
  ): Promise<void> {
    try {
      // Get CI/CD run to find integration and commit info
      const cicdRun = await this.cicdRepository.findRunById(cicdRunId);
      if (!cicdRun) {
        this.logger.warn(`CI/CD run ${cicdRunId} not found`);
        return;
      }

      // Get the integration to find repository info
      const integration = await this.cicdRepository.findIntegrationById(
        cicdRun.integrationId,
      );
      if (!integration || !integration.config) {
        this.logger.warn(`Integration not found for CI/CD run ${cicdRunId}`);
        await this.cicdRepository.updateRun(cicdRunId, {
          status: status === 'success' ? 'success' : 'failure',
          qualityGateResult,
          runId,
          completedAt: new Date(),
        });
        return;
      }

      const config = integration.config as CicdIntegrationConfig;
      const repository = config.repository; // e.g., "owner/repo"

      // Update CI/CD run status
      await this.cicdRepository.updateRun(cicdRunId, {
        status: status === 'success' ? 'success' : 'failure',
        qualityGateResult,
        runId,
        completedAt: new Date(),
      });

      this.logger.log('CI/CD run completed:', {
        id: cicdRunId,
        status,
        qualityGateResult,
        runId,
      });

      // Send status back to GitHub if repository and commit are available
      if (repository && cicdRun.commit) {
        await this.sendGitHubStatus(
          repository,
          cicdRun.commit,
          status,
          qualityGateResult,
          runId,
          config.githubToken
        );
      }
    } catch (error: unknown) {
      this.logger.error('Failed to report CI/CD status:', error);
    }
  }

  private async sendGitHubStatus(
    repository: string, // format: "owner/repo"
    sha: string,
    status: 'success' | 'failure',
    qualityGateResult?: 'pass' | 'warn' | 'fail',
    runId?: string,
    githubToken?: string
  ): Promise<void> {
    try {
      if (!githubToken) {
        this.logger.warn('GitHub token not configured, skipping status update');
        return;
      }

      // Map quality gate result to GitHub status
      let githubState: 'success' | 'failure' | 'error' | 'pending' = 'pending';
      let description = 'Evaluation in progress';

      if (status === 'success') {
        if (qualityGateResult === 'pass') {
          githubState = 'success';
          description = 'All quality gates passed';
        } else if (qualityGateResult === 'warn') {
          githubState = 'success'; // GitHub doesn't have warning, use success
          description = 'Quality gates passed with warnings';
        } else if (qualityGateResult === 'fail') {
          githubState = 'failure';
          description = 'Quality gates failed';
        } else {
          githubState = 'success';
          description = 'Evaluation completed';
        }
      } else {
        githubState = 'error';
        description = 'Evaluation failed';
      }

      // Add run link if available
      const targetUrl = runId
        ? `${process.env['FRONTEND_URL'] || 'http://localhost:4200'}/runs/${runId}`
        : undefined;

      const statusPayload = {
        state: githubState,
        target_url: targetUrl,
        description: description.substring(0, 140), // GitHub limit
        context: 'evalops/quality-gates',
      };

      const [owner, repo] = repository.split('/');
      const url = `https://api.github.com/repos/${owner}/${repo}/statuses/${sha}`;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `token ${githubToken}`,
        Accept: 'application/vnd.github.v3+json',
      };

      await firstValueFrom(
        this.httpService.post(url, statusPayload, { headers })
      );

      this.logger.log(
        `GitHub status updated for ${repository}@${sha}: ${githubState}`
      );
    } catch (error: unknown) {
      this.logger.error('Failed to send GitHub status:', error);
      // Don't throw - status update failure shouldn't break the flow
    }
  }
}
