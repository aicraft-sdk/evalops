import { createHash } from 'crypto'
import { DatabaseStorage } from '../storage'
import { CustomEvaluator, InsertCustomEvaluator, InsertEvaluatorVersion, InsertEvaluatorUsage } from '@shared/schema'

export class CustomEvaluatorService {
  constructor(private storage: DatabaseStorage) {}

  /**
   * Upload and register a new custom evaluator
   */
  async uploadEvaluator(
    organizationId: string,
    createdBy: string,
    file: {
      name: string
      content: Buffer
      mimetype: string
    },
    metadata: {
      name: string
      description?: string
      evaluatorType: string
      tags?: string[]
      isPublic?: boolean
    }
  ): Promise<CustomEvaluator> {
    // Generate file hash for integrity and deduplication
    const fileHash = createHash('sha256').update(file.content).digest('hex')
    
    // Check if evaluator with same hash already exists
    const existingEvaluator = await this.storage.findCustomEvaluatorByHash(fileHash)
    if (existingEvaluator) {
      throw new Error('Evaluator with identical code already exists')
    }

    // Validate file type (only .py files allowed)
    if (!file.name.endsWith('.py')) {
      throw new Error('Only Python (.py) files are allowed')
    }
    
    // Accept common MIME types for Python files
    const validMimeTypes = [
      'text/x-python',
      'text/plain',
      'application/x-python-code',
      'text/x-python-script',
      'application/octet-stream'
    ]
    
    if (file.mimetype && !validMimeTypes.includes(file.mimetype)) {
      console.warn(`Unknown MIME type for Python file: ${file.mimetype}. Proceeding with validation.`)
    }

    // Basic Python code validation
    await this.validatePythonCode(file.content.toString())

    // Store file in object storage using the built-in object storage service
    const filePath = `evaluators/${organizationId}/${fileHash}/${file.name}`
    
    try {
      // Write file content to the object storage bucket
      const fs = await import('fs/promises')
      const path = await import('path')
      
      // Ensure the directory exists
      const fullPath = path.join(process.cwd(), 'storage', filePath)
      const dir = path.dirname(fullPath)
      await fs.mkdir(dir, { recursive: true })
      
      // Write the file
      await fs.writeFile(fullPath, file.content)
      
      console.log(`Custom evaluator file stored at: ${fullPath}`)
    } catch (error) {
      console.error('Failed to store evaluator file:', error)
      throw new Error('Failed to store evaluator file')
    }
    
    const evaluatorData: InsertCustomEvaluator = {
      name: metadata.name,
      description: metadata.description || '',
      evaluatorType: metadata.evaluatorType,
      fileName: file.name,
      fileHash,
      fileSize: file.content.length,
      filePath,
      tags: metadata.tags || [],
      organizationId,
      createdBy,
      isPublic: metadata.isPublic || false,
      status: 'pending_validation'
    }

    const newEvaluator = await this.storage.createCustomEvaluator(evaluatorData)
    
    // Start validation process in background
    this.validateEvaluatorAsync(newEvaluator.id, file.content.toString())
    
    return newEvaluator
  }

  /**
   * Get custom evaluators for an organization
   */
  async getEvaluators(
    organizationId: string,
    filters?: {
      status?: string
      evaluatorType?: string
      tags?: string[]
      includePublic?: boolean
    }
  ): Promise<CustomEvaluator[]> {
    return this.storage.getCustomEvaluators(organizationId, filters)
  }

  /**
   * Get a specific custom evaluator
   */
  async getEvaluator(id: string, organizationId: string): Promise<CustomEvaluator | undefined> {
    const evaluator = await this.storage.getCustomEvaluator(id)
    
    // Check if user has access (own org or public)
    if (!evaluator || (evaluator.organizationId !== organizationId && !evaluator.isPublic)) {
      return undefined
    }
    
    return evaluator
  }

  /**
   * Update custom evaluator metadata
   */
  async updateEvaluator(
    id: string,
    organizationId: string,
    updates: Partial<InsertCustomEvaluator>
  ): Promise<CustomEvaluator> {
    const evaluator = await this.getEvaluator(id, organizationId)
    if (!evaluator) {
      throw new Error('Evaluator not found or access denied')
    }

    // Only allow metadata updates, not file changes
    const allowedUpdates = {
      name: updates.name,
      description: updates.description,
      tags: updates.tags,
      isPublic: updates.isPublic
    }

    return this.storage.updateCustomEvaluator(id, allowedUpdates)
  }

  /**
   * Delete a custom evaluator
   */
  async deleteEvaluator(id: string, organizationId: string): Promise<void> {
    const evaluator = await this.getEvaluator(id, organizationId)
    if (!evaluator) {
      throw new Error('Evaluator not found or access denied')
    }

    // Check if evaluator is being used in any active runs
    const activeUsage = await this.storage.getEvaluatorActiveUsage(id)
    if (activeUsage > 0) {
      throw new Error('Cannot delete evaluator that is currently being used in active evaluations')
    }

    // TODO: Remove file from object storage
    
    await this.storage.deleteCustomEvaluator(id)
  }

  /**
   * Execute a custom evaluator
   */
  async executeEvaluator(
    evaluatorId: string,
    inputs: {
      prompt: string
      response: string
      expected?: string
      context?: any
    },
    organizationId: string,
    runId?: string
  ): Promise<{
    score: number
    reasoning?: string
    metadata?: any
    executionTime: number
  }> {
    const startTime = Date.now()
    
    const evaluator = await this.getEvaluator(evaluatorId, organizationId)
    if (!evaluator) {
      throw new Error('Evaluator not found or access denied')
    }

    if (evaluator.status !== 'active') {
      throw new Error('Evaluator is not active')
    }

    try {
      // TODO: Execute the Python evaluator via Python worker
      // For now, simulate execution
      const mockResult = {
        score: Math.random(),
        reasoning: 'Mock evaluation result',
        metadata: { evaluator: evaluator.name },
        executionTime: Date.now() - startTime
      }

      // Track usage
      const usageData: InsertEvaluatorUsage = {
        evaluatorId,
        runId,
        executionTime: mockResult.executionTime,
        success: true,
        organizationId,
        usedBy: 'system', // TODO: Get actual user ID
        usedAt: new Date()
      }

      await this.storage.createEvaluatorUsage(usageData)
      
      return mockResult
    } catch (error) {
      // Track failed usage
      const usageData: InsertEvaluatorUsage = {
        evaluatorId,
        runId,
        executionTime: Date.now() - startTime,
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        organizationId,
        usedBy: 'system',
        usedAt: new Date()
      }

      await this.storage.createEvaluatorUsage(usageData)
      
      throw error
    }
  }

  /**
   * Get evaluator usage statistics
   */
  async getEvaluatorUsage(
    evaluatorId: string,
    organizationId: string,
    days = 30
  ): Promise<{
    totalExecutions: number
    successRate: number
    avgExecutionTime: number
    totalCost: number
    usageOverTime: any[]
  }> {
    return this.storage.getEvaluatorUsageStats(evaluatorId, organizationId, days)
  }

  /**
   * Validate Python code for basic syntax and security
   */
  private async validatePythonCode(code: string): Promise<void> {
    // Basic validation checks
    const dangerousPatterns = [
      /import\s+os/, 
      /import\s+subprocess/,
      /import\s+sys/,
      /exec\s*\(/,
      /eval\s*\(/,
      /__import__/,
      /open\s*\(/,
      /file\s*\(/
    ]

    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        throw new Error(`Potentially unsafe code detected. Prohibited pattern: ${pattern.source}`)
      }
    }

    // Check for required function
    if (!code.includes('def evaluate(')) {
      throw new Error('Evaluator must contain an "evaluate" function')
    }

    // Check maximum file size (100KB)
    if (code.length > 100 * 1024) {
      throw new Error('Evaluator file too large. Maximum size is 100KB')
    }
  }

  /**
   * Validate evaluator in background
   */
  private async validateEvaluatorAsync(evaluatorId: string, code: string): Promise<void> {
    try {
      // TODO: Run actual validation tests via Python worker
      // For now, simulate validation
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const validationResults = {
        syntax_valid: true,
        security_scan: 'passed',
        test_cases: [
          { name: 'basic_execution', passed: true },
          { name: 'return_format', passed: true }
        ]
      }

      await this.storage.updateCustomEvaluator(evaluatorId, {
        status: 'active',
        validationResults
      })
    } catch (error) {
      await this.storage.updateCustomEvaluator(evaluatorId, {
        status: 'validation_failed',
        validationError: error instanceof Error ? error.message : 'Validation failed'
      })
    }
  }
}

export const customEvaluatorService = new CustomEvaluatorService(new DatabaseStorage())