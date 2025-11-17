import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../utils'
import AdvancedEvals from '../../pages/advanced-evals'
import { server } from '../setup'
import { http, HttpResponse } from 'msw'

describe('AdvancedEvals Page', () => {
  it('should render page title and worker status', async () => {
    render(<AdvancedEvals />)
    
    expect(screen.getByTestId('text-advanced-evals-title')).toHaveTextContent('OpenAI Evals Integration')
    
    await waitFor(() => {
      expect(screen.getByTestId('badge-worker-status')).toHaveTextContent('Python Worker: Online')
    })
  })

  it('should show offline status when worker is unavailable', async () => {
    server.use(
      http.get('/api/python-worker/status', () => {
        return HttpResponse.json({
          healthy: false,
          error: 'Connection failed',
          endpoint: 'http://localhost:8000'
        })
      })
    )

    render(<AdvancedEvals />)
    
    await waitFor(() => {
      expect(screen.getByTestId('badge-worker-status')).toHaveTextContent('Python Worker: Offline')
    })
  })

  it('should start evaluation when form is submitted', async () => {
    const user = userEvent.setup()
    let evaluationStarted = false

    server.use(
      http.post('/api/runs/advanced', () => {
        evaluationStarted = true
        return HttpResponse.json({
          run: { id: 'test-run-1' },
          pythonTaskId: 'test-task-1',
          message: 'Advanced evaluation submitted to Python worker'
        })
      })
    )

    render(<AdvancedEvals />)
    
    // Wait for eval specs to load
    await waitFor(() => {
      expect(screen.getByTestId('select-eval-spec')).toBeInTheDocument()
    })

    // Select eval spec
    await user.click(screen.getByTestId('select-eval-spec'))
    await user.click(screen.getByText('Test Evaluation'))

    // Select evaluation type
    await user.click(screen.getByTestId('select-eval-type'))
    await user.click(screen.getByText('Model Graded'))

    // Start evaluation
    await user.click(screen.getByTestId('button-start-evaluation'))

    await waitFor(() => {
      expect(evaluationStarted).toBe(true)
    })
  })

  it('should display evaluation tasks with real-time updates', async () => {
    server.use(
      http.get('/api/evaluations/advanced', () => {
        return HttpResponse.json([
          {
            task_id: 'test-task-1',
            status: 'running',
            progress: 0.5,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ])
      })
    )

    render(<AdvancedEvals />)
    
    await waitFor(() => {
      expect(screen.getByTestId('task-test-task-1')).toBeInTheDocument()
    })

    expect(screen.getByText('RUNNING')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('should show warning when worker is offline', async () => {
    server.use(
      http.get('/api/python-worker/status', () => {
        return HttpResponse.json({
          healthy: false,
          endpoint: 'http://localhost:8000'
        })
      })
    )

    render(<AdvancedEvals />)
    
    await waitFor(() => {
      expect(screen.getByText(/Python worker must be running/)).toBeInTheDocument()
    })
  })
})