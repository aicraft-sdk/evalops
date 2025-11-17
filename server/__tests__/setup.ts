// Test setup file

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/evalops_test';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';
process.env.SESSION_SECRET = 'test-session-secret';

// Mock console.log/error to reduce noise in tests
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

global.beforeAll(() => {
  console.log = jest.fn() as any;
  console.error = jest.fn() as any;
});

global.afterAll(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
});

global.beforeEach(() => {
  jest.clearAllMocks();
});