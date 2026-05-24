/**
 * Type-safety contract test for AgentsRepository.
 *
 * Verifies that create(), createVersion(), and update() accept all
 * optional columns (description, active, tags, metadata, modelProvider,
 * modelName, changeNotes) that the agents service passes.
 *
 * RED phase: tsc compiles this file — if AgentsRepository uses the too-narrow
 * $inferInsert type, this spec itself will fail with TS2353.
 */
import { AgentsRepository } from '@evalops/shared-db';
import { InsertAgent, InsertAgentVersion } from '@evalops/shared-db';

describe('AgentsRepository type contract', () => {
  it('InsertAgent type includes optional columns (description, active, tags, metadata, modelProvider, modelName)', () => {
    // This assignment is a compile-time type check.
    // If InsertAgent does not include these fields, tsc will error here.
    const _: InsertAgent = {
      organizationId: 'org-1',
      name: 'my-agent',
      version: '1.0.0',
      versionHash: 'abc123',
      content: '# Agent',
      createdBy: 'user-1',
      // Optional fields that must be part of the type:
      description: 'A test agent',
      active: true,
      tags: ['tag1'],
      metadata: { key: 'val' },
      modelProvider: 'openai',
      modelName: 'gpt-4',
    };
    expect(_).toBeDefined();
  });

  it('InsertAgentVersion type includes changeNotes', () => {
    const _: InsertAgentVersion = {
      agentId: 'agent-1',
      organizationId: 'org-1',
      version: '1.0.0',
      versionHash: 'abc123',
      content: '# Agent',
      createdBy: 'user-1',
      // Optional field that must be present:
      changeNotes: 'Initial version',
      metadata: {},
    };
    expect(_).toBeDefined();
  });

  it('AgentsRepository is injectable (class exists)', () => {
    expect(typeof AgentsRepository).toBe('function');
  });
});
