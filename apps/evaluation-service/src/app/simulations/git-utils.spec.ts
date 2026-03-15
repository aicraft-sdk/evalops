import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { execSync } from 'child_process';

jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

import {
  getGitCommitSha,
  getGitCommitShaSync,
} from './git-utils';

describe('git-utils', () => {
  const originalEnv = process.env;
  const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
    // Default to successful git command (returns string when encoding: 'utf-8' is used)
    mockExecSync.mockReturnValue('abc123def456\n' as any);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getGitCommitShaSync', () => {
    it('should return GITHUB_SHA when set', () => {
      process.env.GITHUB_SHA = 'abc123def456';
      const result = getGitCommitShaSync();
      expect(result).toBe('abc123def456');
    });

    it('should return CI_COMMIT_SHA when GITHUB_SHA is not set', () => {
      delete process.env.GITHUB_SHA;
      process.env.CI_COMMIT_SHA = 'gitlab123';
      const result = getGitCommitShaSync();
      expect(result).toBe('gitlab123');
    });

    it('should return CI_COMMIT when other CI vars are not set', () => {
      delete process.env.GITHUB_SHA;
      delete process.env.CI_COMMIT_SHA;
      process.env.CI_COMMIT = 'circle123';
      const result = getGitCommitShaSync();
      expect(result).toBe('circle123');
    });

    it('should return COMMIT_SHA when other CI vars are not set', () => {
      delete process.env.GITHUB_SHA;
      delete process.env.CI_COMMIT_SHA;
      delete process.env.CI_COMMIT;
      process.env.COMMIT_SHA = 'generic123';
      const result = getGitCommitShaSync();
      expect(result).toBe('generic123');
    });

    it('should prioritize GITHUB_SHA over other CI vars', () => {
      process.env.GITHUB_SHA = 'github123';
      process.env.CI_COMMIT_SHA = 'gitlab123';
      process.env.CI_COMMIT = 'circle123';
      process.env.COMMIT_SHA = 'generic123';
      const result = getGitCommitShaSync();
      expect(result).toBe('github123');
    });

    it('should fallback to git command when no CI vars are set', () => {
      delete process.env.GITHUB_SHA;
      delete process.env.CI_COMMIT_SHA;
      delete process.env.CI_COMMIT;
      delete process.env.COMMIT_SHA;
      const result = getGitCommitShaSync();
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should return null when git command fails and no CI vars are set', () => {
      delete process.env.GITHUB_SHA;
      delete process.env.CI_COMMIT_SHA;
      delete process.env.CI_COMMIT;
      delete process.env.COMMIT_SHA;
      mockExecSync.mockImplementation(() => {
        throw new Error('git command failed');
      });
      const result = getGitCommitShaSync();
      expect(result).toBeNull();
    });
  });

  describe('getGitCommitSha', () => {
    it('should return GITHUB_SHA when set', async () => {
      process.env.GITHUB_SHA = 'async123';
      const result = await getGitCommitSha();
      expect(result).toBe('async123');
    });

    it('should return null when git command fails and no CI vars are set', async () => {
      delete process.env.GITHUB_SHA;
      delete process.env.CI_COMMIT_SHA;
      delete process.env.CI_COMMIT;
      delete process.env.COMMIT_SHA;
      mockExecSync.mockImplementation(() => {
        throw new Error('git command failed');
      });
      const result = await getGitCommitSha();
      expect(result).toBeNull();
    });
  });
});
