import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AgentsService } from './agents.service';
import { CreateAgentDto, UpdateAgentDto } from './agents.dto';

interface AuthRequest {
  user?: { id: string; organizationId: string };
}

/**
 * AgentsController — REST endpoints for AgentMD agent management.
 *
 * GET    /agents              — list agents for the org
 * POST   /agents              — create (upload) a new agent
 * GET    /agents/:id          — get agent by ID
 * PATCH  /agents/:id          — update agent content / metadata
 * DELETE /agents/:id          — soft-delete (deactivate)
 * GET    /agents/:id/versions — version history
 */
@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  async findAll(
    @Req() req: AuthRequest,
    @Query('activeOnly') activeOnly?: string,
  ) {
    const orgId = req.user?.organizationId ?? '';
    return this.agentsService.findAll(orgId, activeOnly !== 'false');
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateAgentDto, @Req() req: AuthRequest) {
    const userId = req.user?.id ?? '';
    const orgId = req.user?.organizationId ?? '';
    return this.agentsService.create(dto, userId, orgId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: AuthRequest) {
    const orgId = req.user?.organizationId ?? '';
    return this.agentsService.findOne(id, orgId);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAgentDto,
    @Req() req: AuthRequest,
  ) {
    const userId = req.user?.id ?? '';
    const orgId = req.user?.organizationId ?? '';
    await this.agentsService.update(id, dto, userId, orgId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivate(@Param('id') id: string, @Req() req: AuthRequest) {
    const orgId = req.user?.organizationId ?? '';
    await this.agentsService.deactivate(id, orgId);
  }

  @Get(':id/versions')
  async getVersionHistory(@Param('id') id: string, @Req() req: AuthRequest) {
    const orgId = req.user?.organizationId ?? '';
    return this.agentsService.getVersionHistory(id, orgId);
  }
}
