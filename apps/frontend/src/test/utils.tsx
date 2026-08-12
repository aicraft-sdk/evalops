import { render, type RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '../components/layout/theme-provider'
import { getQueryFn } from '../lib/queryClient'
import { Router } from 'wouter'
import { ReactElement, useState } from 'react'

// Custom render function with providers
const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  // Must be memoized (useState initializer, not a plain body-level `new`) -
  // otherwise every re-render (e.g. a query settling from loading to
  // loaded, which is exactly what auth-gated pages do) creates a brand new
  // QueryClient, wiping all in-flight/cached query state and re-triggering
  // an infinite loading loop for any component that gates its render on
  // `isLoading`.
  //
  // Also needs the same default `queryFn` as the app's real singleton
  // QueryClient (`@/lib/queryClient`) - every page in this app calls
  // `useQuery({ queryKey: [...] })` with NO explicit `queryFn`, relying
  // entirely on this default to actually fetch. Without it, every query
  // resolves to `status: 'error'` (missing queryFn) with `data: undefined`
  // and pages silently render their empty/loading state instead of real
  // mocked data.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            queryFn: getQueryFn({ on401: 'returnNull' }),
            retry: false,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )

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