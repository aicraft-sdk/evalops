import { AgentMDParser } from '../parser';

const validAgentMD = `---
metadata:
  name: test-agent
  version: "1.0.0"
model:
  provider: openai
  model: gpt-4o
---
You are a helpful test assistant.`;

const missingNameAgentMD = `---
metadata:
  version: "1.0.0"
model:
  provider: openai
  model: gpt-4o
---
System prompt.`;

const missingVersionAgentMD = `---
metadata:
  name: my-agent
model:
  provider: openai
  model: gpt-4o
---`;

const malformedYamlMD = `---
metadata: [broken yaml: {
---
System prompt.`;

const noFrontMatterMD = `Just plain text without front-matter.`;

describe('AgentMDParser', () => {
  let parser: AgentMDParser;

  beforeEach(() => {
    parser = new AgentMDParser();
  });

  describe('valid AgentMD', () => {
    it('parses a well-formed AgentMD file', () => {
      const result = parser.parse(validAgentMD);
      expect(result.parseErrors).toBeUndefined();
      expect(result.agentMD.metadata.name).toBe('test-agent');
      expect(result.agentMD.metadata.version).toBe('1.0.0');
      expect(result.agentMD.model.provider).toBe('openai');
      expect(result.agentMD.model.model).toBe('gpt-4o');
    });

    it('extracts the system prompt from the markdown body', () => {
      const result = parser.parse(validAgentMD);
      expect(result.agentMD.systemPrompt).toContain('helpful test assistant');
    });
  });

  describe('missing required fields', () => {
    it('throws when metadata.name is missing', () => {
      expect(() => parser.parse(missingNameAgentMD)).toThrow(/metadata.name/);
    });

    it('throws when metadata.version is missing', () => {
      expect(() => parser.parse(missingVersionAgentMD)).toThrow(/metadata.version/);
    });
  });

  describe('malformed YAML', () => {
    it('returns an error result instead of throwing for malformed YAML', () => {
      const result = parser.parse(malformedYamlMD);
      expect(result.parseErrors).toBeDefined();
      expect(result.parseErrors!.length).toBeGreaterThan(0);
    });

    it('returns an empty AgentMD structure for malformed YAML', () => {
      const result = parser.parse(malformedYamlMD);
      expect(result.agentMD.metadata.name).toBe('unknown');
    });
  });

  describe('empty content', () => {
    it('returns an error result for content with no front-matter', () => {
      const result = parser.parse(noFrontMatterMD);
      expect(result.parseErrors).toBeDefined();
      expect(result.parseErrors!.join(' ')).toMatch(/front-matter/i);
    });

    it('preserves the rawContent', () => {
      const result = parser.parse(noFrontMatterMD);
      expect(result.rawContent).toBe(noFrontMatterMD);
    });
  });
});
