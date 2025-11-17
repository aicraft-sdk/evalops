import { test, expect } from '@playwright/test'

test.describe('Evaluation Workflow E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication
    await page.route('/api/auth/user', async route => {
      await route.fulfill({
        json: {
          id: 'test-user-id',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          role: 'admin',
          organizationId: 'test-org-id'
        }
      })
    })

    // Mock eval specs
    await page.route('/api/eval-specs', async route => {
      await route.fulfill({
        json: [
          {
            id: 'test-eval-spec-1',
            name: 'Test Evaluation',
            description: 'Test evaluation specification',
            modelProvider: 'openai',
            modelName: 'gpt-4'
          }
        ]
      })
    })

    // Mock Python worker status
    await page.route('/api/python-worker/status', async route => {
      await route.fulfill({
        json: {
          healthy: true,
          info: {
            service: 'EvalOps OpenAI Evals Worker',
            openai_configured: true
          },
          endpoint: 'http://localhost:8000'
        }
      })
    })

    // Mock evaluation tasks
    await page.route('/api/evaluations/advanced', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          json: []
        })
      }
    })
  })

  test('should complete full evaluation workflow', async ({ page }) => {
    await page.goto('/advanced-evals')

    // Check page loads correctly
    await expect(page.getByTestId('text-advanced-evals-title')).toHaveText('OpenAI Evals Integration')
    
    // Check worker status is online
    await expect(page.getByTestId('badge-worker-status')).toHaveText('Python Worker: Online')

    // Select evaluation specification
    await page.getByTestId('select-eval-spec').click()
    await page.getByText('Test Evaluation').click()

    // Select evaluation type
    await page.getByTestId('select-eval-type').click()
    await page.getByText('Model Graded').click()

    // Mock the evaluation submission
    await page.route('/api/runs/advanced', async route => {
      await route.fulfill({
        json: {
          run: { id: 'test-run-1' },
          pythonTaskId: 'test-task-1',
          message: 'Advanced evaluation submitted to Python worker'
        }
      })
    })

    // Start evaluation
    await page.getByTestId('button-start-evaluation').click()

    // Should show success toast
    await expect(page.getByText('Advanced Evaluation Started')).toBeVisible()
  })

  test('should handle offline worker gracefully', async ({ page }) => {
    // Mock offline worker
    await page.route('/api/python-worker/status', async route => {
      await route.fulfill({
        json: {
          healthy: false,
          error: 'Connection failed',
          endpoint: 'http://localhost:8000'
        }
      })
    })

    await page.goto('/advanced-evals')

    // Check worker status shows offline
    await expect(page.getByTestId('badge-worker-status')).toHaveText('Python Worker: Offline')

    // Should show warning about worker being offline
    await expect(page.getByText(/Python worker must be running/)).toBeVisible()

    // Evaluation button should be disabled
    await expect(page.getByTestId('button-start-evaluation')).toBeDisabled()
  })

  test('should display real-time task updates', async ({ page }) => {
    // Mock running task
    await page.route('/api/evaluations/advanced', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          json: [
            {
              task_id: 'test-task-1',
              status: 'running',
              progress: 0.75,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }
          ]
        })
      }
    })

    await page.goto('/advanced-evals')

    // Should show running task
    await expect(page.getByTestId('task-test-task-1')).toBeVisible()
    await expect(page.getByText('RUNNING')).toBeVisible()
    await expect(page.getByText('75%')).toBeVisible()
  })

  test('should navigate between pages correctly', async ({ page }) => {
    await page.goto('/')

    // Navigate to advanced evals page
    await page.getByText('Advanced Evaluations').click()
    
    await expect(page).toHaveURL('/advanced-evals')
    await expect(page.getByTestId('text-advanced-evals-title')).toBeVisible()
  })

  test('should handle API errors gracefully', async ({ page }) => {
    // Mock API error
    await page.route('/api/eval-specs', async route => {
      await route.fulfill({
        status: 500,
        json: { message: 'Internal server error' }
      })
    })

    await page.goto('/advanced-evals')

    // Should handle error gracefully (not crash)
    await expect(page.getByTestId('text-advanced-evals-title')).toBeVisible()
  })
})