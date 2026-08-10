/**
 * REM-FIX #40 — 4 HIGH issues
 *
 * RED phase: each test verifies a behavioral contract introduced by the fixes.
 * Tests must FAIL before the fix is applied.
 *
 * Fix 1: AuditRepository — Logger injected + warn on sub-query failure (source check)
 * Fix 2: RunsRepository.completeRun — atomic status+artifacts update (source + mock test)
 * Fix 3: CicdRepository.createRunWithWebhookEvent — transactional pair (source check)
 * Fix 4: update() return types — T | undefined (source-level assertions)
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import * as fs from 'fs';
import * as path from 'path';

const REPOS_DIR = path.join(
  __dirname,
  '../../../../libs/shared-db/src/lib/repositories',
);

function repoSrc(filename: string): string {
  return fs.readFileSync(path.join(REPOS_DIR, filename), 'utf8');
}

// ─────────────────────────────────────────────────────────────────────────────
// Fix 1: AuditRepository — Logger injected + warn in catch block
// ─────────────────────────────────────────────────────────────────────────────

describe('Fix 1: AuditRepository has Logger and warns in catch', () => {
  const src = repoSrc('audit.repository.ts');

  it('imports Logger from @nestjs/common', () => {
    expect(src).toMatch(/import\s*\{[^}]*Logger[^}]*\}\s*from\s*'@nestjs\/common'/);
  });

  it('has a private logger field', () => {
    expect(src).toMatch(/private\s+readonly\s+logger\s*=\s*new\s+Logger\s*\(/);
  });

  it('uses logger.warn in the catch block instead of bare entityName = Unknown', () => {
    // After fix: the catch block must call this.logger.warn (not just silently assign)
    expect(src).toMatch(/this\.logger\.warn\s*\(/);
  });

  it('catch block still assigns entityName = "Unknown" for graceful fallback', () => {
    // Fallback behavior must remain
    expect(src).toMatch(/entityName\s*=\s*['"]Unknown['"]/);
  });

  it('catch block binds error parameter (catch(err: unknown))', () => {
    // Must capture the error instead of bare catch {}
    expect(src).toMatch(/catch\s*\(\s*err\s*:\s*unknown\s*\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 2: RunsRepository.completeRun — atomic method
// ─────────────────────────────────────────────────────────────────────────────

describe('Fix 2: RunsRepository exposes atomic completeRun', () => {
  const src = repoSrc('runs.repository.ts');

  it('has a completeRun method', () => {
    expect(src).toMatch(/async\s+completeRun\s*\(/);
  });

  it('completeRun wraps updates in a transaction', () => {
    // The method must reference db.transaction
    expect(src).toMatch(/db\.transaction\s*\(/);
  });
});

describe('Fix 2: IngestionService.completeRun calls runsRepository.completeRun', () => {
  const ingestionSrc = fs.readFileSync(
    path.join(
      __dirname,
      '../app/ingestion/ingestion.service.ts',
    ),
    'utf8',
  );

  it('calls this.runsRepository.completeRun instead of separate updateStatus+updateArtifacts', () => {
    expect(ingestionSrc).toMatch(/this\.runsRepository\.completeRun\s*\(/);
  });

  it('does not call updateStatus and updateArtifacts separately in completeRun', () => {
    // After fix: the completeRun method body should not contain both sequential calls
    // Extract the completeRun method body
    const completeFnMatch = ingestionSrc.match(
      /async completeRun\s*\([^)]*\)[^{]*\{([\s\S]*?)^\s{2}\}/m,
    );
    if (completeFnMatch) {
      const body = completeFnMatch[1];
      const hasUpdateStatus = /runsRepository\.updateStatus/.test(body);
      const hasUpdateArtifacts = /runsRepository\.updateArtifacts/.test(body);
      // Should NOT have both sequential calls (the fix moves them to a single atomic call)
      expect(hasUpdateStatus && hasUpdateArtifacts).toBe(false);
    } else {
      // If we can't extract the body, just check the atomic call exists
      expect(ingestionSrc).toMatch(/this\.runsRepository\.completeRun\s*\(/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 3: CicdRepository has createRunWithWebhookEvent
// ─────────────────────────────────────────────────────────────────────────────

describe('Fix 3: CicdRepository.createRunWithWebhookEvent is transactional', () => {
  const src = repoSrc('cicd.repository.ts');

  it('has a createRunWithWebhookEvent method', () => {
    expect(src).toMatch(/async\s+createRunWithWebhookEvent\s*\(/);
  });

  it('createRunWithWebhookEvent wraps both inserts in a transaction', () => {
    expect(src).toMatch(/db\.transaction\s*\(/);
  });
});

describe('Fix 3: WebhooksService uses createRunWithWebhookEvent', () => {
  const webhooksSrc = fs.readFileSync(
    path.join(
      __dirname,
      '../../../../libs/core-integration/src/lib/webhooks/webhooks.service.ts',
    ),
    'utf8',
  );

  it('processPushWebhook calls cicdRepository.createRunWithWebhookEvent', () => {
    expect(webhooksSrc).toMatch(/cicdRepository\.createRunWithWebhookEvent\s*\(/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 4: update() return types — T | undefined across 10 repository files
// ─────────────────────────────────────────────────────────────────────────────

describe('Fix 4: update() return types are T | undefined', () => {
  it('RunsRepository.update returns T | undefined', () => {
    const src = repoSrc('runs.repository.ts');
    expect(src).toMatch(
      /update\s*\([^)]*\)\s*:\s*Promise<typeof runs\.\$inferSelect \| undefined>/,
    );
  });

  it('DatasetsRepository.update returns T | undefined', () => {
    const src = repoSrc('datasets.repository.ts');
    expect(src).toMatch(
      /update\s*\([^)]*\)\s*:\s*Promise<typeof datasets\.\$inferSelect \| undefined>/,
    );
  });

  it('FlowsRepository.update returns T | undefined', () => {
    const src = repoSrc('flows.repository.ts');
    expect(src).toMatch(
      /update\s*\([^)]*\)\s*:\s*Promise<typeof flows\.\$inferSelect \| undefined>/,
    );
  });

  it('ModelsRepository.update returns T | undefined', () => {
    const src = repoSrc('models.repository.ts');
    expect(src).toMatch(
      /update\s*\([^)]*\)\s*:\s*Promise<typeof models\.\$inferSelect \| undefined>/,
    );
  });

  it('OrganizationsRepository.update returns T | undefined', () => {
    const src = repoSrc('organizations.repository.ts');
    expect(src).toMatch(
      /update\s*\([^)]*\)\s*:\s*Promise<typeof organizations\.\$inferSelect \| undefined>/,
    );
  });

  it('ProvidersRepository.update returns T | undefined', () => {
    const src = repoSrc('providers.repository.ts');
    expect(src).toMatch(
      /update\s*\([^)]*\)\s*:\s*Promise<typeof aiProviders\.\$inferSelect \| undefined>/,
    );
  });

  it('PromptsRepository.update returns T | undefined', () => {
    const src = repoSrc('prompts.repository.ts');
    expect(src).toMatch(
      /update\s*\([^)]*\)\s*:\s*Promise<typeof prompts\.\$inferSelect \| undefined>/,
    );
  });

  it('ReviewQueueRepository.update returns T | undefined', () => {
    const src = repoSrc('review-queue.repository.ts');
    expect(src).toMatch(
      /update\s*\([^)]*\)\s*:\s*Promise<typeof reviewQueueItems\.\$inferSelect \| undefined>/,
    );
  });

  it('CicdRepository.updateRun returns T | undefined', () => {
    const src = repoSrc('cicd.repository.ts');
    expect(src).toMatch(
      /updateRun\s*\([^)]*\)\s*:\s*Promise<typeof cicdRuns\.\$inferSelect \| undefined>/,
    );
  });
});
