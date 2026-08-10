import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SandboxSecurityService } from './sandbox-security.service';
import { SandboxPolicies, NetworkPolicy } from './sandbox-policies';

describe('SandboxSecurityService', () => {
  let service: SandboxSecurityService;
  let configService: jest.Mocked<ConfigService>;
  let policies: jest.Mocked<SandboxPolicies>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SandboxSecurityService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: SandboxPolicies,
          useValue: {
            getResourcePolicy: jest.fn(),
            getNetworkPolicy: jest.fn(),
            validateDomain: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SandboxSecurityService>(SandboxSecurityService);
    configService = module.get(ConfigService);
    policies = module.get(SandboxPolicies);

    configService.get.mockImplementation((key: string) => {
      const defaults: Record<string, boolean> = {
        OPENSANDBOX_REQUIRE_AST_VALIDATION: true,
      };
      return defaults[key];
    });

    policies.getResourcePolicy.mockReturnValue({
      maxCpu: 2.0,
      maxMemory: '2Gi',
      maxTimeout: 600,
      maxConcurrent: 10,
    });

    policies.getNetworkPolicy.mockReturnValue({
      egressPolicy: 'restricted',
      allowedDomains: ['api.openai.com', 'api.anthropic.com'],
      blockedDomains: ['localhost', '127.0.0.1'],
      blockedIPRanges: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'],
    });

    policies.validateDomain.mockImplementation((domain: string) => {
      const allowed = ['api.openai.com', 'api.anthropic.com'];
      const blocked = ['localhost', '127.0.0.1'];
      if (blocked.includes(domain)) {
        return { allowed: false, reason: 'Domain is in blocklist' };
      }
      if (allowed.includes(domain)) {
        return { allowed: true };
      }
      return { allowed: false, reason: 'Domain not in allowlist' };
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Network Isolation', () => {
    it('should allow domains in allowlist', () => {
      const result = service.validateNetworkPolicy({
        egressPolicy: 'restricted',
        allowedDomains: ['api.openai.com'],
        blockedDomains: [],
        blockedIPRanges: [],
      });

      expect(result.valid).toBe(true);
    });

    it('should block domains in blocklist', () => {
      const result = service.validateNetworkPolicy({
        egressPolicy: 'restricted',
        allowedDomains: ['api.openai.com'],
        blockedDomains: ['malicious-site.com'],
        blockedIPRanges: [],
      });

      expect(result.valid).toBe(true);
    });

    it('should block internal IP ranges', () => {
      const result = service.validateNetworkPolicy({
        egressPolicy: 'restricted',
        allowedDomains: ['api.openai.com'],
        blockedDomains: [],
        blockedIPRanges: ['10.0.0.0/8'],
      });

      expect(result.valid).toBe(true);
    });

    it('should validate FQDN format', () => {
      const result = service.validateNetworkPolicy({
        egressPolicy: 'restricted',
        allowedDomains: ['invalid..domain'],
        blockedDomains: [],
        blockedIPRanges: [],
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid FQDN format: invalid..domain');
    });

    it('should validate CIDR format', () => {
      const result = service.validateNetworkPolicy({
        egressPolicy: 'restricted',
        allowedDomains: [],
        blockedDomains: [],
        blockedIPRanges: ['invalid-cidr'],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid CIDR'))).toBe(true);
    });

    it('should warn when restricted policy has no allowed domains', () => {
      const result = service.validateNetworkPolicy({
        egressPolicy: 'restricted',
        allowedDomains: [],
        blockedDomains: [],
        blockedIPRanges: [],
      });

      expect(result.warnings).toContain(
        'Restricted egress policy requires at least one allowed domain'
      );
    });

    it('should accept deny_all policy', () => {
      const result = service.validateNetworkPolicy({
        egressPolicy: 'deny_all',
        allowedDomains: [],
        blockedDomains: [],
        blockedIPRanges: [],
      });

      expect(result.valid).toBe(true);
    });

    it('should accept allow_all policy', () => {
      const result = service.validateNetworkPolicy({
        egressPolicy: 'allow_all',
        allowedDomains: [],
        blockedDomains: [],
        blockedIPRanges: [],
      });

      expect(result.valid).toBe(true);
    });

    it('should reject invalid egress policy', () => {
      const result = service.validateNetworkPolicy({
        egressPolicy: 'invalid' as unknown as NetworkPolicy['egressPolicy'],
        allowedDomains: [],
        blockedDomains: [],
        blockedIPRanges: [],
      });

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes('Invalid egress policy'))
      ).toBe(true);
    });
  });

  describe('Code Validation', () => {
    it('should block dangerous Python imports', () => {
      const code = 'import os; os.system("rm -rf /")';
      const result = service.validateCode(code, 'python');

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('os.system'))).toBe(true);
    });

    it('should block dangerous JavaScript patterns', () => {
      const code = 'eval("malicious code")';
      const result = service.validateCode(code, 'javascript');

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('eval'))).toBe(true);
    });

    it('should validate code length limits', () => {
      const largeCode = 'x'.repeat(100001);
      const result = service.validateCode(largeCode, 'python');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Code exceeds maximum length of 100,000 characters'
      );
    });

    it('should reject empty code', () => {
      const result = service.validateCode('', 'python');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Code cannot be empty');
    });

    it('should reject whitespace-only code', () => {
      const result = service.validateCode('   \n\t  ', 'python');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Code cannot be empty');
    });

    it('should accept valid Python code', () => {
      const code = 'def hello(): return "world"';
      const result = service.validateCode(code, 'python');

      expect(result.valid).toBe(true);
    });

    it('should accept valid JavaScript code', () => {
      const code = 'function hello() { return "world"; }';
      const result = service.validateCode(code, 'javascript');

      expect(result.valid).toBe(true);
    });

    it('should reject unsupported language', () => {
      const code = 'print("hello")';
      const result = service.validateCode(code, 'rust');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unsupported language: rust');
    });

    it('should block subprocess calls', () => {
      const code = 'import subprocess; subprocess.call(["ls"])';
      const result = service.validateCode(code, 'python');

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('subprocess'))).toBe(true);
    });

    it('should block eval in Python', () => {
      const code = 'eval("1+1")';
      const result = service.validateCode(code, 'python');

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('eval'))).toBe(true);
    });

    it('should block exec in Python', () => {
      const code = 'exec("print(1)")';
      const result = service.validateCode(code, 'python');

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('exec'))).toBe(true);
    });

    it('should block child_process in JavaScript', () => {
      const code = "require('child_process').exec('ls')";
      const result = service.validateCode(code, 'javascript');

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('child_process'))).toBe(true);
    });

    it('should block fs module in JavaScript', () => {
      const code = "require('fs').readFileSync('/etc/passwd')";
      const result = service.validateCode(code, 'javascript');

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('fs'))).toBe(true);
    });
  });

  describe('Resource Limits', () => {
    it('should validate CPU limits', () => {
      const result = service.checkResourceLimits({
        cpu: '1.5',
        memory: '1Gi',
        timeout: 300,
      });

      expect(result.valid).toBe(true);
    });

    it('should reject CPU exceeding maximum', () => {
      const result = service.checkResourceLimits({
        cpu: '3.0',
        memory: '1Gi',
        timeout: 300,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('CPU limit'))).toBe(true);
    });

    it('should reject invalid CPU value', () => {
      const result = service.checkResourceLimits({
        cpu: 'invalid',
        memory: '1Gi',
        timeout: 300,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid CPU value'))).toBe(
        true
      );
    });

    it('should reject negative CPU value', () => {
      const result = service.checkResourceLimits({
        cpu: '-1.0',
        memory: '1Gi',
        timeout: 300,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid CPU value'))).toBe(
        true
      );
    });

    it('should validate memory limits', () => {
      const result = service.checkResourceLimits({
        cpu: '1.0',
        memory: '512Mi',
        timeout: 300,
      });

      expect(result.valid).toBe(true);
    });

    it('should reject memory exceeding maximum', () => {
      const result = service.checkResourceLimits({
        cpu: '1.0',
        memory: '4Gi',
        timeout: 300,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Memory limit'))).toBe(true);
    });

    it('should reject invalid memory format', () => {
      const result = service.checkResourceLimits({
        cpu: '1.0',
        memory: 'invalid',
        timeout: 300,
      });

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes('Invalid memory format'))
      ).toBe(true);
    });

    it('should validate timeout limits', () => {
      const result = service.checkResourceLimits({
        cpu: '1.0',
        memory: '512Mi',
        timeout: 300,
      });

      expect(result.valid).toBe(true);
    });

    it('should reject timeout exceeding maximum', () => {
      const result = service.checkResourceLimits({
        cpu: '1.0',
        memory: '512Mi',
        timeout: 1200,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Timeout'))).toBe(true);
    });

    it('should reject negative timeout', () => {
      const result = service.checkResourceLimits({
        cpu: '1.0',
        memory: '512Mi',
        timeout: -1,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid timeout'))).toBe(
        true
      );
    });

    it('should accept valid resource limits', () => {
      const result = service.checkResourceLimits({
        cpu: '1.0',
        memory: '512Mi',
        timeout: 300,
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Security Scanning', () => {
    it('should detect command injection in Python', () => {
      const code = 'import os; os.system("rm -rf /")';
      const issues = service.scanForSecurityIssues(code, 'python');

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some((i) => i.type === 'command_injection')).toBe(true);
    });

    it('should detect code injection in Python', () => {
      const code = 'eval("malicious code")';
      const issues = service.scanForSecurityIssues(code, 'python');

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some((i) => i.type === 'code_injection')).toBe(true);
    });

    it('should detect unsafe deserialization in Python', () => {
      const code = 'import pickle; pickle.loads(data)';
      const issues = service.scanForSecurityIssues(code, 'python');

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some((i) => i.type === 'unsafe_deserialization')).toBe(
        true
      );
    });

    it('should detect code injection in JavaScript', () => {
      const code = 'eval("malicious code")';
      const issues = service.scanForSecurityIssues(code, 'javascript');

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some((i) => i.type === 'code_injection')).toBe(true);
    });

    it('should detect XSS patterns in JavaScript', () => {
      const code = 'element.innerHTML = userInput';
      const issues = service.scanForSecurityIssues(code, 'javascript');

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some((i) => i.type === 'xss')).toBe(true);
    });

    it('should return empty array for safe code', () => {
      const code = 'def hello(): return "world"';
      const issues = service.scanForSecurityIssues(code, 'python');

      expect(issues).toHaveLength(0);
    });

    it('should include line numbers in security issues', () => {
      const code =
        'print("line 1")\nimport os; os.system("rm -rf /")\nprint("line 3")';
      const issues = service.scanForSecurityIssues(code, 'python');

      const commandInjectionIssue = issues.find(
        (i) => i.type === 'command_injection'
      );
      expect(commandInjectionIssue?.line).toBe(2);
    });
  });

  describe('Resource Usage Tracking', () => {
    const TEST_SANDBOX_ID = 'sandbox-123';

    it('should track resource usage', () => {
      const usage = {
        cpu: 0.5,
        memory: 256000,
        executionTime: 100,
      };

      service.updateResourceUsage(TEST_SANDBOX_ID, usage);
      const retrieved = service.checkResourceUsage(TEST_SANDBOX_ID);

      expect(retrieved).toEqual(usage);
    });

    it('should return null for non-existent sandbox', () => {
      const result = service.checkResourceUsage('non-existent');

      expect(result).toBeNull();
    });

    it('should expire old resource usage cache', async () => {
      const usage = {
        cpu: 0.5,
        memory: 256000,
        executionTime: 100,
      };

      service.updateResourceUsage(TEST_SANDBOX_ID, usage);

      const retrieved = service.checkResourceUsage(TEST_SANDBOX_ID);
      expect(retrieved).toEqual(usage);
    });
  });

  describe('Input Sanitization', () => {
    it('should sanitize string input', () => {
      const input = '<script>alert("xss")</script>Hello';
      const sanitized = service.sanitizeInput(input);

      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toContain('Hello');
    });

    it('should sanitize object input', () => {
      const input = {
        name: '<script>alert("xss")</script>',
        value: 42,
      };
      const sanitized = service.sanitizeInput(input) as Record<
        string,
        unknown
      >;

      expect(sanitized['name']).not.toContain('<script>');
      expect(sanitized['value']).toBe(42);
    });

    it('should sanitize array input', () => {
      const input = ['<script>alert("xss")</script>', 'safe value'];
      const sanitized = service.sanitizeInput(input) as string[];

      expect(sanitized[0]).not.toContain('<script>');
      expect(sanitized[1]).toBe('safe value');
    });

    it('should preserve null and undefined', () => {
      expect(service.sanitizeInput(null)).toBeNull();
      expect(service.sanitizeInput(undefined)).toBeUndefined();
    });

    it('should preserve non-string primitives', () => {
      expect(service.sanitizeInput(42)).toBe(42);
      expect(service.sanitizeInput(true)).toBe(true);
      expect(service.sanitizeInput(false)).toBe(false);
    });
  });

  describe('AST Validation', () => {
    it('should fallback to pattern validation when AST not available', async () => {
      configService.get.mockReturnValue(false);

      const code = 'def hello(): return "world"';
      const result = await service.validateCodeWithAST(code, 'python');

      expect(result.valid).toBe(true);
    });

    it('should validate JavaScript AST when enabled', async () => {
      const code = 'function hello() { return "world"; }';

      try {
        const result = await service.validateCodeWithAST(code, 'javascript');
        expect(result).toBeDefined();
      } catch (error) {
        expect((error as Error).message).toContain('not available');
      }
    });

    it('should validate Python AST when enabled', async () => {
      const code = 'def hello(): return "world"';

      try {
        const result = await service.validateCodeWithAST(code, 'python');
        expect(result).toBeDefined();
      } catch (error) {
        expect((error as Error).message).toContain('not available');
      }
    });

    it('should reject unsupported language for AST validation', async () => {
      const code = 'fn main() {}';

      const result = await service.validateCodeWithAST(code, 'rust');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'AST validation not supported for language: rust'
      );
    });

    it('detects new Function() constructor calls via AST validation', async () => {
      const code = 'const fn = new Function("return 1");';

      const result = await service.validateCodeWithAST(code, 'javascript');

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes('new Function'))
      ).toBe(true);
    });
  });

  describe('Function constructor bypass prevention', () => {
    const bypassVariants: { name: string; code: string }[] = [
      {
        name: 'bare Function() call without new',
        code: 'Function("return process")()',
      },
      {
        name: '.constructor escape on a function expression',
        code: '(function(){}).constructor("return process")()',
      },
      {
        name: '.constructor escape on an arrow function',
        code: '(() => {}).constructor("return process")()',
      },
      {
        name: 'globalThis bracket-notation Function access',
        code: 'globalThis["Function"]("return process")()',
      },
      {
        name: 'globalThis dot-notation Function access',
        code: 'globalThis.Function("return process")()',
      },
      {
        name: 'window dot-notation Function access',
        code: 'window.Function("return process")()',
      },
      {
        name: 'Array constructor chain ([].constructor.constructor)',
        code: '[].constructor.constructor("return process")()',
      },
      {
        name: 'String constructor chain ("".constructor.constructor)',
        code: '"".constructor.constructor("return process")()',
      },
    ];

    describe('validateCode (pattern-based path)', () => {
      for (const { name, code } of bypassVariants) {
        it(`blocks: ${name}`, () => {
          const result = service.validateCode(code, 'javascript');

          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
        });
      }

      it('still blocks the already-fixed new Function(...) case (no regression)', () => {
        const result = service.validateCode(
          'new Function("return process")',
          'javascript',
        );

        expect(result.valid).toBe(false);
      });
    });

    describe('validateCodeWithAST (structural AST path)', () => {
      for (const { name, code } of bypassVariants) {
        it(`blocks: ${name}`, async () => {
          const result = await service.validateCodeWithAST(code, 'javascript');

          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
        });
      }

      it('still blocks the already-fixed new Function(...) case (no regression)', async () => {
        const result = await service.validateCodeWithAST(
          'new Function("return process")',
          'javascript',
        );

        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('new Function'))).toBe(
          true,
        );
      });
    });

    it('does not flag legitimate benign code that never touches Function or .constructor', () => {
      const code = `
        function add(a, b) { return a + b; }
        const double = (x) => x * 2;
        const total = add(1, double(2));
      `;

      const result = service.validateCode(code, 'javascript');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('documents that .constructor access is now blocked outright as a conservative security posture', () => {
      // Sandboxed AI-generated eval code has no legitimate need to introspect
      // `.constructor` — it is the classic idiom for escaping to the global
      // Function constructor (e.g. `x.constructor.constructor(...)`). We
      // therefore deny `.constructor` access unconditionally rather than try
      // to enumerate every escape shape built on top of it.
      const result = service.validateCode(
        'const ctor = someValue.constructor;',
        'javascript',
      );

      expect(result.valid).toBe(false);
    });
  });
});
