import { execSync } from 'child_process';

/**
 * Get the current commit SHA from CI environment variables or git command.
 *
 * Priority order:
 * 1. GITHUB_SHA (GitHub Actions)
 * 2. CI_COMMIT_SHA (GitLab CI)
 * 3. CI_COMMIT (CircleCI, Travis CI)
 * 4. COMMIT_SHA (Generic CI)
 * 5. git rev-parse HEAD (fallback to git command)
 *
 * @returns Commit SHA string or null if unable to determine
 */
export async function getGitCommitSha(): Promise<string | null> {
  // Check CI environment variables first
  const ciCommitSha =
    process.env.GITHUB_SHA ||
    process.env.CI_COMMIT_SHA ||
    process.env.CI_COMMIT ||
    process.env.COMMIT_SHA;

  if (ciCommitSha) {
    return ciCommitSha;
  }

  // Fallback to git command
  try {
    const sha = execSync('git rev-parse HEAD', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    return sha || null;
  } catch (error) {
    // Git command failed (not a git repo, git not installed, etc.)
    return null;
  }
}

/**
 * Synchronous version of getGitCommitSha for use in non-async contexts.
 *
 * @returns Commit SHA string or null if unable to determine
 */
export function getGitCommitShaSync(): string | null {
  const ciCommitSha =
    process.env.GITHUB_SHA ||
    process.env.CI_COMMIT_SHA ||
    process.env.CI_COMMIT ||
    process.env.COMMIT_SHA;

  if (ciCommitSha) {
    return ciCommitSha;
  }

  try {
    const sha = execSync('git rev-parse HEAD', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    return sha || null;
  } catch (error) {
    return null;
  }
}
