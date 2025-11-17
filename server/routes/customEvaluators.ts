import { Router } from 'express'
import { customEvaluatorService } from '../services/customEvaluatorService'
import { permissionService } from '../services/permissionService'
import { z } from 'zod'

const router = Router()

// Validation schemas
const createEvaluatorSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  evaluatorType: z.string().min(1),
  tags: z.array(z.string()).optional(),
  isPublic: z.boolean().optional().default(false),
  file: z.object({
    name: z.string(),
    content: z.string(), // base64 encoded content
    mimetype: z.string().optional()
  })
})

const updateEvaluatorSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  isPublic: z.boolean().optional()
})

const executeEvaluatorSchema = z.object({
  prompt: z.string(),
  response: z.string(), 
  expected: z.string().optional(),
  context: z.any().optional()
})

// Upload custom evaluator
router.post('/upload', async (req: any, res) => {
  try {
    const user = req.user?.claims
    if (!user?.sub) {
      return res.status(401).json({ message: 'Authentication required' })
    }

    const userData = await req.storage.getUser(user.sub)
    if (!userData) {
      return res.status(404).json({ message: 'User not found' })
    }

    // Check permissions
    const hasPermission = await permissionService.hasPermission({
      userId: user.sub,
      resourceType: 'model',
      action: 'write'
    })
    if (!hasPermission) {
      return res.status(403).json({ message: 'Insufficient permissions' })
    }

    const data = createEvaluatorSchema.parse(req.body)
    
    // Decode base64 content
    const fileContent = Buffer.from(data.file.content, 'base64')
    
    // Validate file size (100KB max)
    if (fileContent.length > 100 * 1024) {
      return res.status(400).json({ message: 'File size exceeds 100KB limit' })
    }
    
    // Validate file extension
    if (!data.file.name.endsWith('.py')) {
      return res.status(400).json({ message: 'Only Python (.py) files are allowed' })
    }
    
    const evaluator = await customEvaluatorService.uploadEvaluator(
      userData.organizationId,
      user.sub,
      {
        name: data.file.name,
        content: fileContent,
        mimetype: data.file.mimetype || 'text/x-python'
      },
      {
        name: data.name,
        description: data.description,
        evaluatorType: data.evaluatorType,
        tags: data.tags,
        isPublic: data.isPublic
      }
    )

    res.json({
      message: 'Evaluator uploaded successfully',
      evaluator: {
        id: evaluator.id,
        name: evaluator.name,
        status: evaluator.status,
        evaluatorType: evaluator.evaluatorType
      }
    })
  } catch (error) {
    console.error('Error uploading evaluator:', error)
    res.status(400).json({ 
      message: error instanceof Error ? error.message : 'Failed to upload evaluator' 
    })
  }
})

// Get custom evaluators
router.get('/', async (req: any, res) => {
  try {
    const user = req.user?.claims
    if (!user?.sub) {
      return res.status(401).json({ message: 'Authentication required' })
    }

    const userData = await req.storage.getUser(user.sub)
    if (!userData) {
      return res.status(404).json({ message: 'User not found' })
    }

    const filters = {
      status: req.query.status as string,
      evaluatorType: req.query.evaluatorType as string,
      tags: req.query.tags ? JSON.parse(req.query.tags as string) : undefined,
      includePublic: req.query.includePublic === 'true'
    }

    const evaluators = await customEvaluatorService.getEvaluators(
      userData.organizationId,
      filters
    )

    res.json(evaluators)
  } catch (error) {
    console.error('Error getting evaluators:', error)
    res.status(500).json({ message: 'Failed to get evaluators' })
  }
})

// Get specific evaluator
router.get('/:id', async (req: any, res) => {
  try {
    const user = req.user?.claims
    if (!user?.sub) {
      return res.status(401).json({ message: 'Authentication required' })
    }

    const userData = await req.storage.getUser(user.sub)
    if (!userData) {
      return res.status(404).json({ message: 'User not found' })
    }

    const evaluator = await customEvaluatorService.getEvaluator(
      req.params.id,
      userData.organizationId
    )

    if (!evaluator) {
      return res.status(404).json({ message: 'Evaluator not found' })
    }

    res.json(evaluator)
  } catch (error) {
    console.error('Error getting evaluator:', error)
    res.status(500).json({ message: 'Failed to get evaluator' })
  }
})

// Update evaluator metadata
router.put('/:id', async (req: any, res) => {
  try {
    const user = req.user?.claims
    if (!user?.sub) {
      return res.status(401).json({ message: 'Authentication required' })
    }

    const userData = await req.storage.getUser(user.sub)
    if (!userData) {
      return res.status(404).json({ message: 'User not found' })
    }

    // Check permissions
    const hasPermission = await permissionService.hasPermission({
      userId: user.sub,
      resourceType: 'model',
      action: 'write'
    })
    if (!hasPermission) {
      return res.status(403).json({ message: 'Insufficient permissions' })
    }

    const updates = updateEvaluatorSchema.parse(req.body)
    
    const evaluator = await customEvaluatorService.updateEvaluator(
      req.params.id,
      userData.organizationId,
      updates
    )

    res.json(evaluator)
  } catch (error) {
    console.error('Error updating evaluator:', error)
    res.status(400).json({ 
      message: error instanceof Error ? error.message : 'Failed to update evaluator' 
    })
  }
})

// Delete evaluator
router.delete('/:id', async (req: any, res) => {
  try {
    const user = req.user?.claims
    if (!user?.sub) {
      return res.status(401).json({ message: 'Authentication required' })
    }

    const userData = await req.storage.getUser(user.sub)
    if (!userData) {
      return res.status(404).json({ message: 'User not found' })
    }

    // Check permissions
    const hasPermission = await permissionService.hasPermission({
      userId: user.sub,
      resourceType: 'model',
      action: 'delete'
    })
    if (!hasPermission) {
      return res.status(403).json({ message: 'Insufficient permissions' })
    }

    await customEvaluatorService.deleteEvaluator(
      req.params.id,
      userData.organizationId
    )

    res.json({ message: 'Evaluator deleted successfully' })
  } catch (error) {
    console.error('Error deleting evaluator:', error)
    res.status(400).json({ 
      message: error instanceof Error ? error.message : 'Failed to delete evaluator' 
    })
  }
})

// Execute evaluator
router.post('/:id/execute', async (req: any, res) => {
  try {
    const user = req.user?.claims
    if (!user?.sub) {
      return res.status(401).json({ message: 'Authentication required' })
    }

    const userData = await req.storage.getUser(user.sub)
    if (!userData) {
      return res.status(404).json({ message: 'User not found' })
    }

    // Check permissions
    const hasPermission = await permissionService.hasPermission({
      userId: user.sub,
      resourceType: 'eval_spec',
      action: 'execute'
    })
    if (!hasPermission) {
      return res.status(403).json({ message: 'Insufficient permissions' })
    }

    const inputs = executeEvaluatorSchema.parse(req.body)
    
    const result = await customEvaluatorService.executeEvaluator(
      req.params.id,
      inputs,
      userData.organizationId,
      req.body.runId
    )

    res.json(result)
  } catch (error) {
    console.error('Error executing evaluator:', error)
    res.status(400).json({ 
      message: error instanceof Error ? error.message : 'Failed to execute evaluator' 
    })
  }
})

// Get evaluator usage statistics
router.get('/:id/usage', async (req: any, res) => {
  try {
    const user = req.user?.claims
    if (!user?.sub) {
      return res.status(401).json({ message: 'Authentication required' })
    }

    const userData = await req.storage.getUser(user.sub)
    if (!userData) {
      return res.status(404).json({ message: 'User not found' })
    }

    const days = parseInt(req.query.days as string) || 30
    
    const usage = await customEvaluatorService.getEvaluatorUsage(
      req.params.id,
      userData.organizationId,
      days
    )

    res.json(usage)
  } catch (error) {
    console.error('Error getting evaluator usage:', error)
    res.status(500).json({ message: 'Failed to get evaluator usage' })
  }
})

export default router