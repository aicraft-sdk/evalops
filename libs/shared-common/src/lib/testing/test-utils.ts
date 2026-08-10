import { Test } from '@nestjs/testing';
import { INestApplication, ModuleMetadata } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { jest } from '@jest/globals';

/**
 * Test utilities for NestJS services
 */

export interface TestModuleOptions {
  imports?: ModuleMetadata['imports'];
  providers?: ModuleMetadata['providers'];
  controllers?: ModuleMetadata['controllers'];
}

/**
 * Create a test module for unit testing
 */
export async function createTestModule(options: TestModuleOptions) {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        envFilePath: ['.env.test', '.env'],
      }),
      ...(options.imports || []),
    ],
    providers: options.providers || [],
    controllers: options.controllers || [],
  }).compile();

  return moduleRef;
}

/**
 * Create a test application for integration testing
 */
export async function createTestApp(
  options: TestModuleOptions
): Promise<INestApplication> {
  const moduleRef = await createTestModule(options);
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

/**
 * Mock HTTP client for testing
 */
export function createMockHttpClient() {
  return {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
  };
}

/**
 * Mock database storage service
 */
export function createMockStorageService() {
  return {
    getUser: jest.fn(),
    getUserByEmail: jest.fn(),
    upsertUser: jest.fn(),
    getOrganization: jest.fn(),
    createOrganization: jest.fn(),
    getPrompts: jest.fn(),
    getPrompt: jest.fn(),
    createPrompt: jest.fn(),
    updatePrompt: jest.fn(),
    deletePrompt: jest.fn(),
    getDatasets: jest.fn(),
    getDataset: jest.fn(),
    createDataset: jest.fn(),
    getEvalSpecs: jest.fn(),
    getEvalSpec: jest.fn(),
    createEvalSpec: jest.fn(),
    getRuns: jest.fn(),
    getRun: jest.fn(),
    createRun: jest.fn(),
    updateRun: jest.fn(),
    createSampleResult: jest.fn(),
    getPolicies: jest.fn(),
    createPolicyViolation: jest.fn(),
  };
}

interface TestUserFixture {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  organizationId: string;
  role: string;
  profileImageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TestOrganizationFixture {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

interface TestPromptFixture {
  id: string;
  name: string;
  content: string;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface TestDatasetFixture {
  id: string;
  name: string;
  organizationId: string;
  samples: unknown[];
  createdAt: Date;
  updatedAt: Date;
}

interface TestEvalSpecFixture {
  id: string;
  name: string;
  datasetId: string;
  promptId: string;
  organizationId: string;
  repetitions: number;
  seeds: number[];
  evaluators: Array<{ type: string; config: Record<string, unknown> }>;
  modelConfig: { temperature: number; maxTokens: number };
  createdAt: Date;
  updatedAt: Date;
}

interface TestRunFixture {
  id: string;
  name: string;
  evalSpecId: string;
  organizationId: string;
  status: string;
  triggeredBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Test data factories
 */
export const TestDataFactory = {
  createUser: (overrides?: Partial<TestUserFixture>): TestUserFixture => ({
    id: 'test-user-1',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    organizationId: 'test-org-1',
    role: 'admin',
    profileImageUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  createOrganization: (
    overrides?: Partial<TestOrganizationFixture>,
  ): TestOrganizationFixture => ({
    id: 'test-org-1',
    name: 'Test Organization',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  createPrompt: (
    overrides?: Partial<TestPromptFixture>,
  ): TestPromptFixture => ({
    id: 'test-prompt-1',
    name: 'Test Prompt',
    content: 'This is a test prompt',
    organizationId: 'test-org-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  createDataset: (
    overrides?: Partial<TestDatasetFixture>,
  ): TestDatasetFixture => ({
    id: 'test-dataset-1',
    name: 'Test Dataset',
    organizationId: 'test-org-1',
    samples: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  createEvalSpec: (
    overrides?: Partial<TestEvalSpecFixture>,
  ): TestEvalSpecFixture => ({
    id: 'test-eval-spec-1',
    name: 'Test Eval Spec',
    datasetId: 'test-dataset-1',
    promptId: 'test-prompt-1',
    organizationId: 'test-org-1',
    repetitions: 1,
    seeds: [12345],
    evaluators: [{ type: 'exact_match', config: { strictness: 'moderate' } }],
    modelConfig: { temperature: 0.7, maxTokens: 1000 },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  createRun: (overrides?: Partial<TestRunFixture>): TestRunFixture => ({
    id: 'test-run-1',
    name: 'Test Run',
    evalSpecId: 'test-eval-spec-1',
    organizationId: 'test-org-1',
    status: 'pending',
    triggeredBy: 'test-user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),
};
