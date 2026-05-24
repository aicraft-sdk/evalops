import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { AgentsRepository } from '@evalops/shared-db';
import { agents } from '@evalops/shared-db';
import { hashContent } from '@evalops/sdk';
import { AgentMDParser } from '@evalops/agent-md';
import { CreateAgentDto, UpdateAgentDto } from './agents.dto';

/**
 * AgentsService — CRUD + versioning for AgentMD-defined agents.
 *
 * Version history is maintained in the agent_versions table.
 * Every content change creates a new immutable version snapshot.
 */
@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);
  private readonly parser = new AgentMDParser();

  constructor(private readonly agentsRepository: AgentsRepository) {}

  async create(
    dto: CreateAgentDto,
    userId: string,
    organizationId: string,
  ): Promise<typeof agents.$inferSelect> {
    const versionHash = hashContent(dto.content);
    const parseResult = this.parser.parse(dto.content);

    if (parseResult.parseErrors?.length) {
      this.logger.warn(
        `AgentMD parse warnings for '${dto.name}': ${parseResult.parseErrors.join('; ')}`,
      );
    }

    const agent = await this.agentsRepository.create({
      organizationId,
      name: dto.name,
      description: dto.description,
      version: dto.version,
      versionHash,
      content: dto.content,
      modelProvider: parseResult.agentMD.model?.provider,
      modelName: parseResult.agentMD.model?.model,
      tags: dto.tags ?? [],
      metadata: dto.metadata ?? {},
      active: true,
      createdBy: userId,
    });

    // Record initial version snapshot
    await this.agentsRepository.createVersion({
      agentId: agent.id,
      organizationId,
      version: dto.version,
      versionHash,
      content: dto.content,
      changeNotes: 'Initial version',
      metadata: {},
      createdBy: userId,
    });

    return agent;
  }

  async findAll(organizationId: string, activeOnly = true) {
    return this.agentsRepository.findAllByOrg(organizationId, activeOnly);
  }

  async findOne(id: string, organizationId: string) {
    const agent = await this.agentsRepository.findById(id, organizationId);
    if (!agent) {
      throw new NotFoundException(`Agent ${id} not found`);
    }
    return agent;
  }

  async update(
    id: string,
    dto: UpdateAgentDto,
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const agent = await this.findOne(id, organizationId);

    const updates: Record<string, unknown> = {};
    if (dto.description !== undefined) updates['description'] = dto.description;
    if (dto.tags !== undefined) updates['tags'] = dto.tags;
    if (dto.metadata !== undefined) updates['metadata'] = dto.metadata;

    if (dto.content !== undefined) {
      const versionHash = hashContent(dto.content);
      if (versionHash === agent.versionHash) {
        // Content unchanged — only metadata update
      } else {
        const newVersion = dto.version ?? agent.version;
        updates['content'] = dto.content;
        updates['version'] = newVersion;
        updates['versionHash'] = versionHash;

        // Extract model info from updated content
        const parsed = this.parser.parse(dto.content);
        updates['modelProvider'] = parsed.agentMD.model?.provider;
        updates['modelName'] = parsed.agentMD.model?.model;

        // Record new version snapshot
        await this.agentsRepository.createVersion({
          agentId: id,
          organizationId,
          version: newVersion,
          versionHash,
          content: dto.content,
          changeNotes: undefined,
          metadata: {},
          createdBy: userId,
        });
      }
    }

    await this.agentsRepository.update(id, organizationId, updates);
  }

  async deactivate(id: string, organizationId: string): Promise<void> {
    await this.findOne(id, organizationId); // 404 if not found
    await this.agentsRepository.update(id, organizationId, { active: false });
  }

  async getVersionHistory(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.agentsRepository.findVersions(id, organizationId);
  }
}
