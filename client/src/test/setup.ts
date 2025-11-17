import '@testing-library/jest-dom'
import { beforeAll, afterEach, afterAll } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

// Mock server for API calls
export const server = setupServer(
  // Default handlers
  http.get('/api/auth/user', () => {
    return HttpResponse.json({
      id: 'test-user-id',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      role: 'admin',
      organizationId: 'test-org-id'
    })
  }),

  http.get('/api/eval-specs', () => {
    return HttpResponse.json([
      {
        id: 'test-eval-spec-1',
        name: 'Test Evaluation',
        description: 'Test evaluation specification',
        modelProvider: 'openai',
        modelName: 'gpt-4'
      }
    ])
  }),

  http.get('/api/python-worker/status', () => {
    return HttpResponse.json({
      healthy: true,
      info: {
        service: 'EvalOps OpenAI Evals Worker',
        openai_configured: true
      },
      endpoint: 'http://localhost:8000'
    })
  }),

  http.get('/api/evaluations/advanced', () => {
    return HttpResponse.json([])
  })
)

// Start server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

// Reset handlers after each test
afterEach(() => server.resetHandlers())

// Clean up after all tests
afterAll(() => server.close())

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
})

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}