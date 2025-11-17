import crypto from 'crypto';
import { storage } from '../storage';
import type { InsertWebhookEvent, InsertCicdRun } from '@shared/schema';

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

export class WebhookService {
  // Verify GitHub webhook signature
  verifyGitHubSignature(payload: string, signature: string, secret: string): boolean {
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
  }

  // Process GitHub push webhook
  async processPushWebhook(
    integrationId: string,
    payload: GitHubPushPayload,
    organizationId: string
  ): Promise<void> {
    // Create webhook event record
    const webhookEvent: InsertWebhookEvent = {
      integrationId,
      eventType: 'push',
      payload: payload as any,
      organizationId,
    };
    
    await storage.createWebhookEvent(webhookEvent);

    // Check if this is a push to main/master branch
    const isMainBranch = payload.ref === 'refs/heads/main' || payload.ref === 'refs/heads/master';
    
    if (isMainBranch) {
      // Create CI/CD run for main branch pushes
      const cicdRun: InsertCicdRun = {
        integrationId,
        externalRunId: `push-${payload.head_commit.id}`,
        branch: payload.ref.replace('refs/heads/', ''),
        commit: payload.head_commit.id,
        status: 'pending',
        startedAt: new Date(),
        metadata: {
          commitMessage: payload.head_commit.message,
          author: payload.head_commit.author,
          pusher: payload.pusher,
        },
        organizationId,
      };
      
      await storage.createCicdRun(cicdRun);
      
      // TODO: Trigger evaluation run based on integration configuration
      await this.triggerEvaluationRun(integrationId, cicdRun, organizationId);
    }
  }

  // Process GitHub pull request webhook
  async processPullRequestWebhook(
    integrationId: string,
    payload: GitHubPullRequestPayload,
    organizationId: string
  ): Promise<void> {
    // Create webhook event record
    const webhookEvent: InsertWebhookEvent = {
      integrationId,
      eventType: 'pull_request',
      payload: payload as any,
      organizationId,
    };
    
    await storage.createWebhookEvent(webhookEvent);

    // Only process opened and synchronize actions
    if (['opened', 'synchronize'].includes(payload.action)) {
      // Create CI/CD run for PR
      const cicdRun: InsertCicdRun = {
        integrationId,
        externalRunId: `pr-${payload.pull_request.number}-${payload.pull_request.head.sha}`,
        branch: payload.pull_request.head.ref,
        commit: payload.pull_request.head.sha,
        pullRequestNumber: payload.pull_request.number,
        status: 'pending',
        startedAt: new Date(),
        metadata: {
          prTitle: payload.pull_request.title,
          prNumber: payload.pull_request.number,
          action: payload.action,
        },
        organizationId,
      };
      
      await storage.createCicdRun(cicdRun);
      
      // TODO: Trigger evaluation run for PR
      await this.triggerEvaluationRun(integrationId, cicdRun, organizationId);
    }
  }

  // Trigger evaluation run based on CI/CD context
  private async triggerEvaluationRun(
    integrationId: string,
    cicdRun: any,
    organizationId: string
  ): Promise<void> {
    try {
      // Get integration configuration
      const integration = await storage.getCicdIntegrationById(integrationId);
      if (!integration || !integration.config) {
        throw new Error('Integration configuration not found');
      }

      const config = integration.config as any;
      
      // Check if auto-trigger is enabled
      if (!config.autoTriggerEvaluations) {
        console.log('Auto-trigger disabled for integration:', integrationId);
        return;
      }

      // Get the evaluation spec to run
      const evalSpecId = config.defaultEvalSpecId;
      if (!evalSpecId) {
        console.log('No default eval spec configured for integration:', integrationId);
        return;
      }

      // TODO: Create evaluation run
      // This will be implemented when we have the evaluation engine integrated
      console.log('Would trigger evaluation run for:', {
        integrationId,
        evalSpecId,
        cicdRunId: cicdRun.id,
        branch: cicdRun.branch,
        commit: cicdRun.commit,
      });

      // Update CI/CD run status
      await storage.updateCicdRun(cicdRun.id, {
        status: 'running',
      });

    } catch (error) {
      console.error('Failed to trigger evaluation run:', error);
      
      // Update CI/CD run with failure
      await storage.updateCicdRun(cicdRun.id, {
        status: 'failure',
        completedAt: new Date(),
        metadata: {
          ...cicdRun.metadata,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  }

  // Report CI/CD run status back to external system
  async reportStatus(
    cicdRunId: string,
    status: 'success' | 'failure',
    qualityGateResult?: 'pass' | 'warn' | 'fail',
    runId?: string
  ): Promise<void> {
    try {
      const cicdRun = await storage.updateCicdRun(cicdRunId, {
        status: status === 'success' ? 'success' : 'failure',
        qualityGateResult,
        runId,
        completedAt: new Date(),
      });

      // TODO: Send status back to GitHub/external system
      console.log('CI/CD run completed:', {
        id: cicdRunId,
        status,
        qualityGateResult,
        runId,
      });

    } catch (error) {
      console.error('Failed to report CI/CD status:', error);
    }
  }
}

export const webhookService = new WebhookService();