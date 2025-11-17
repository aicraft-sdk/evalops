import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { registerRoutes } from '../routes'
import { DatabaseStorage } from '../storage'
import { vi } from 'vitest'

// Mock the storage
vi.mock('../storage', () => ({
  DatabaseStorage: vi.fn().mockImplementation(() => ({
    getUser: vi.fn().mockResolvedValue({
      id: 'test-user-id',
      email: 'test@example.com',
      organizationId: 'test-org-id',
      role: 'admin'
    }),
    getEvalSpecs: vi.fn().mockResolvedValue([
      {
        id: 'test-eval-spec-1',
        name: 'Test Evaluation',
        description: 'Test evaluation specification',
        organizationId: 'test-org-id'
      }
    ]),
    getRuns: vi.fn().mockResolvedValue([]),
    createRun: vi.fn().mockResolvedValue({
      id: 'test-run-1',
      evalSpecId: 'test-eval-spec-1',
      status: 'pending',
      organizationId: 'test-org-id'
    })
  }))
}))

// Mock Python worker service
vi.mock('../services/pythonWorkerService', () => ({
  pythonWorker: {
    isHealthy: vi.fn().mockResolvedValue(true),
    getWorkerInfo: vi.fn().mockResolvedValue({
      service: 'EvalOps OpenAI Evals Worker',
      openai_configured: true
    }),
    submitEvaluation: vi.fn().mockResolvedValue({
      task_id: 'test-task-1',
      status: 'pending',
      message: 'Evaluation task created and queued'
    }),
    getTaskStatus: vi.fn().mockResolvedValue({
      task_id: 'test-task-1',
      status: 'completed',
      progress: 1.0,
      results: {
        total_samples: 10,
        pass_rate: 0.8
      }
    }),
    listTasks: vi.fn().mockResolvedValue([])
  }
}))

// Mock permission service
vi.mock('../services/permissionService', () => ({
  permissionService: {
    hasPermission: vi.fn().mockResolvedValue(true)
  }
}))

describe('API Routes', () => {
  let app: express.Application

  beforeEach(async () => {
    app = express()
    app.use(express.json())
    
    // Mock authentication middleware
    app.use((req: any, res, next) => {
      req.user = {
        claims: {
          sub: 'test-user-id'
        }
      }
      next()
    })

    await registerRoutes(app)
  })

  describe('Python Worker Endpoints', () => {
    it('should get python worker status', async () => {
      const response = await request(app)
        .get('/api/python-worker/status')
        .expect(200)

      expect(response.body.healthy).toBe(true)
      expect(response.body.info.service).toBe('EvalOps OpenAI Evals Worker')
    })

    it('should submit advanced evaluation', async () => {
      const evaluationRequest = {
        evalSpecId: 'test-eval-spec-1',
        datasetSamples: [
          { input: 'test input', expected_output: 'test output' }
        ],
        modelConfig: { model: 'gpt-4', temperature: 0.7 },
        evaluationType: 'model_graded'
      }

      const response = await request(app)
        .post('/api/evaluations/advanced')
        .send(evaluationRequest)
        .expect(200)

      expect(response.body.task_id).toBe('test-task-1')
      expect(response.body.status).toBe('pending')
    })

    it('should get evaluation task status', async () => {
      const response = await request(app)
        .get('/api/evaluations/advanced/test-task-1')
        .expect(200)

      expect(response.body.task_id).toBe('test-task-1')
      expect(response.body.status).toBe('completed')
      expect(response.body.progress).toBe(1.0)
    })

    it('should create advanced run', async () => {
      const runRequest = {
        evalSpecId: 'test-eval-spec-1',
        useAdvancedEvals: true,
        evaluationType: 'model_graded'
      }

      const response = await request(app)
        .post('/api/runs/advanced')
        .send(runRequest)
        .expect(200)

      expect(response.body.pythonTaskId).toBe('test-task-1')
      expect(response.body.message).toContain('Advanced evaluation submitted')
    })
  })

  describe('Error Handling', () => {
    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/evaluations/advanced')
        .send({
          evalSpecId: 'test-eval-spec-1'
          // Missing required fields
        })
        .expect(400)

      expect(response.body.message).toContain('Missing required fields')
    })

    it('should return 404 for non-existent task', async () => {
      const { pythonWorker } = await import('../services/pythonWorkerService')
      vi.mocked(pythonWorker.getTaskStatus).mockRejectedValueOnce(new Error('Task not found'))

      await request(app)
        .get('/api/evaluations/advanced/non-existent-task')
        .expect(404)
    })
  })
})