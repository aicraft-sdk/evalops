export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/apps', '<rootDir>/libs'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@evalops/shared$': '<rootDir>/libs/shared/src/index.ts',
    '^@evalops/shared-db$': '<rootDir>/libs/shared-db/src/index.ts',
    '^@evalops/sdk$': '<rootDir>/libs/sdk/src/index.ts',
    '^@evalops/evaluators$': '<rootDir>/libs/evaluators/src/index.ts',
    '^@evalops/agent-md$': '<rootDir>/libs/agent-md/src/index.ts',
    '^@evalops/shared-auth$': '<rootDir>/libs/shared-auth/src/index.ts',
    '^@/(.*)$': '<rootDir>/apps/frontend/src/$1',
  },
  collectCoverageFrom: [
    'apps/**/*.ts',
    'libs/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/__tests__/**',
    '!**/dist/**',
    '!**/index.ts',
    '!**/*.spec.ts',
  ],
  coverageThresholds: {
    './libs/sdk/**': {
      branches: 70,
      lines: 75,
    },
    './libs/evaluators/**': {
      branches: 70,
      lines: 75,
    },
    './libs/agent-md/**': {
      branches: 70,
      lines: 75,
    },
  },
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 30000,
};
