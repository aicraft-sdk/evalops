import { render, type RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '../components/layout/theme-provider'
import { Router } from 'wouter'
import { ReactElement } from 'react'

// Custom render function with providers
const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  })

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Router>
          {children}
        </Router>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: AllTheProviders, ...options })

export * from '@testing-library/react'
export { customRender as render }

// Test utilities
export const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  role: 'admin' as const,
  organizationId: 'test-org-id'
}

export const mockEvalSpec = {
  id: 'test-eval-spec-1',
  name: 'Test Evaluation',
  description: 'Test evaluation specification',
  modelProvider: 'openai',
  modelName: 'gpt-4',
  organizationId: 'test-org-id',
  createdBy: 'test-user-id'
}

export const mockDataset = {
  id: 'test-dataset-1',
  name: 'Test Dataset',
  description: 'Test dataset',
  sampleCount: 10,
  organizationId: 'test-org-id',
  createdBy: 'test-user-id'
}

export const mockRun = {
  id: 'test-run-1',
  evalSpecId: 'test-eval-spec-1',
  status: 'completed' as const,
  decision: 'pass' as const,
  organizationId: 'test-org-id',
  triggeredBy: 'test-user-id'
}

// Mock fetch responses
export const createMockResponse = (data: any, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
  text: async () => JSON.stringify(data),
})

export const waitForQuery = async () => {
  await new Promise(resolve => setTimeout(resolve, 0))
}