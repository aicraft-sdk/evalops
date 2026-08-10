import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SandboxPolicies, NetworkPolicy } from './sandbox-policies';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface SecurityIssue {
  severity: 'error' | 'warning';
  type: string;
  message: string;
  line?: number;
  column?: number;
}

export interface ResourceUsage {
  cpu: number;
  memory: number; // bytes
  executionTime: number; // milliseconds
}

/** Minimal shape of an ESTree-compatible AST node, as produced by @typescript-eslint/parser. */
interface AstNode {
  type: string;
  callee?: AstNode;
  name?: string;
  value?: unknown;
  arguments?: AstNode[];
  [key: string]: unknown;
}

/**
 * The specific reason a callee/reference expression was classified as
 * dangerous, so callers can produce a precise error message.
 */
type DangerousReferenceKind =
  | 'function-identifier'
  | 'function-member'
  | 'constructor-member'
  | 'unresolved-global-computed';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@Injectable()
export class SandboxSecurityService {
  private readonly logger = new Logger(SandboxSecurityService.name);
  private readonly policies: SandboxPolicies;
  private readonly requireASTValidation: boolean;

  private readonly blockedPythonImports = [
    'os.system',
    'subprocess',
    'eval',
    'exec',
    '__import__',
    'open(',
    'file(',
    'input(',
    'raw_input(',
  ];

  private readonly blockedJavaScriptPatterns = [
    /eval\s*\(/,
    /new\s+Function\s*\(/,
    // Bare `Function(...)` call (no `new`) — per spec, calling the Function
    // constructor without `new` still constructs a function, so this is
    // behaviorally identical to `new Function(...)`.
    /\bFunction\s*\(/,
    // Member/computed access to the global Function constructor, e.g.
    // globalThis.Function(...), window["Function"](...), this.Function(...).
    /(?:globalThis|window|self|this)\s*(?:\.\s*Function\b|\[\s*['"]Function['"]\s*\])/,
    // `.constructor` property access (dot or bracket notation) — the
    // classic sandbox-escape idiom (`x.constructor("...")`,
    // `x.constructor.constructor("...")`, `[].constructor.constructor(...)`,
    // `"".constructor.constructor(...)`). Sandboxed AI-generated eval code
    // has no legitimate need to introspect `.constructor`, so it is denied
    // outright rather than trying to enumerate every escape shape built on
    // top of it.
    /\.\s*constructor\b/,
    /\[\s*['"]constructor['"]\s*\]/,
    /require\s*\(\s*['"]child_process['"]/,
    /require\s*\(\s*['"]fs['"]/,
    /require\s*\(\s*['"]os['"]/,
    /process\.exec/,
    /process\.spawn/,
    /child_process/,
  ];

  // Track resource usage per sandbox (in-memory cache)
  private readonly resourceUsageCache = new Map<
    string,
    { usage: ResourceUsage; lastUpdated: number }
  >();

  constructor(private readonly configService: ConfigService) {
    this.policies = new SandboxPolicies(configService);
    this.requireASTValidation =
      this.configService.get<boolean>(
        'OPENSANDBOX_REQUIRE_AST_VALIDATION',
      ) ?? true;
  }

  validateCode(code: string, language: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!code || code.trim().length === 0) {
      errors.push('Code cannot be empty');
      return { valid: false, errors, warnings };
    }

    if (code.length > 100000) {
      errors.push('Code exceeds maximum length of 100,000 characters');
      return { valid: false, errors, warnings };
    }

    if (language === 'python') {
      this.validatePythonCode(code, errors);
    } else if (language === 'javascript') {
      this.validateJavaScriptCode(code, errors);
    } else {
      errors.push(`Unsupported language: ${language}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  checkResourceLimits(config: {
    cpu?: string;
    memory?: string;
    timeout?: number;
  }): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const resourcePolicy = this.policies.getResourcePolicy();

    if (config.cpu) {
      const cpuValue = parseFloat(config.cpu);
      if (isNaN(cpuValue) || cpuValue <= 0) {
        errors.push(`Invalid CPU value: ${config.cpu}`);
      } else if (cpuValue > resourcePolicy.maxCpu) {
        errors.push(
          `CPU limit ${config.cpu} exceeds maximum ${resourcePolicy.maxCpu}`,
        );
      }
    }

    if (config.memory) {
      const memoryMatch = config.memory.match(/^(\d+)([KMGT]?i?)$/i);
      if (!memoryMatch) {
        errors.push(`Invalid memory format: ${config.memory}`);
      } else {
        const requestedBytes = this.parseMemoryToBytes(config.memory);
        const maxBytes = this.parseMemoryToBytes(resourcePolicy.maxMemory);
        if (requestedBytes > maxBytes) {
          errors.push(
            `Memory limit ${config.memory} exceeds maximum ${resourcePolicy.maxMemory}`,
          );
        }
      }
    }

    if (config.timeout) {
      if (config.timeout <= 0) {
        errors.push(`Invalid timeout value: ${config.timeout}`);
      } else if (config.timeout > resourcePolicy.maxTimeout) {
        errors.push(
          `Timeout ${config.timeout}s exceeds maximum ${resourcePolicy.maxTimeout}s`,
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate network policy
   */
  validateNetworkPolicy(policy: NetworkPolicy): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate egress policy
    if (
      !['deny_all', 'allow_all', 'restricted'].includes(policy.egressPolicy)
    ) {
      errors.push(
        `Invalid egress policy: ${policy.egressPolicy}. Must be deny_all, allow_all, or restricted`,
      );
    }

    // Validate allowed domains (FQDN format)
    if (policy.egressPolicy === 'restricted') {
      if (!policy.allowedDomains || policy.allowedDomains.length === 0) {
        warnings.push(
          'Restricted egress policy requires at least one allowed domain',
        );
      } else {
        for (const domain of policy.allowedDomains) {
          if (!this.isValidFQDN(domain)) {
            errors.push(`Invalid FQDN format: ${domain}`);
          }
        }
      }
    }

    // Validate blocked domains
    if (policy.blockedDomains) {
      for (const domain of policy.blockedDomains) {
        if (!this.isValidDomain(domain)) {
          warnings.push(`Invalid domain format in blocklist: ${domain}`);
        }
      }
    }

    // Validate blocked IP ranges (CIDR format)
    if (policy.blockedIPRanges) {
      for (const range of policy.blockedIPRanges) {
        if (!this.isValidCIDR(range)) {
          errors.push(`Invalid CIDR format: ${range}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate code using AST-based analysis
   */
  async validateCodeWithAST(
    code: string,
    language: string,
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.requireASTValidation) {
      // Fall back to pattern-based validation
      return this.validateCode(code, language);
    }

    try {
      if (language === 'javascript' || language === 'typescript') {
        await this.validateJavaScriptAST(code, errors, warnings);
      } else if (language === 'python') {
        await this.validatePythonAST(code, errors, warnings);
      } else {
        errors.push(`AST validation not supported for language: ${language}`);
      }
    } catch (error: unknown) {
      this.logger.warn(
        `AST validation failed, falling back to pattern matching: ${getErrorMessage(error)}`,
      );
      // Fall back to pattern-based validation
      return this.validateCode(code, language);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Scan code for security issues
   */
  scanForSecurityIssues(
    code: string,
    language: string,
  ): SecurityIssue[] {
    const issues: SecurityIssue[] = [];

    if (language === 'python') {
      this.scanPythonSecurityIssues(code, issues);
    } else if (language === 'javascript' || language === 'typescript') {
      this.scanJavaScriptSecurityIssues(code, issues);
    }

    return issues;
  }

  /**
   * Check resource usage for a sandbox
   */
  checkResourceUsage(sandboxId: string): ResourceUsage | null {
    const cached = this.resourceUsageCache.get(sandboxId);
    if (!cached) {
      return null;
    }

    // Return cached usage if it's less than 5 minutes old
    const ageMs = Date.now() - cached.lastUpdated;
    if (ageMs > 5 * 60 * 1000) {
      this.resourceUsageCache.delete(sandboxId);
      return null;
    }

    return cached.usage;
  }

  /**
   * Update resource usage for a sandbox
   */
  updateResourceUsage(
    sandboxId: string,
    usage: ResourceUsage,
  ): void {
    this.resourceUsageCache.set(sandboxId, {
      usage,
      lastUpdated: Date.now(),
    });
  }

  sanitizeInput(input: unknown): unknown {
    if (input === null || input === undefined) {
      return input;
    }

    if (typeof input === 'string') {
      // Remove potential script tags and dangerous patterns
      return input
        .replace(/<script[^>]*>.*?<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '');
    }

    if (Array.isArray(input)) {
      return input.map((item) => this.sanitizeInput(item));
    }

    if (typeof input === 'object') {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input)) {
        sanitized[key] = this.sanitizeInput(value);
      }
      return sanitized;
    }

    return input;
  }

  private validatePythonCode(
    code: string,
    errors: string[],
  ): void {
    for (const blocked of this.blockedPythonImports) {
      if (code.includes(blocked)) {
        errors.push(`Blocked Python import/operation detected: ${blocked}`);
      }
    }

    // Check for potentially dangerous patterns
    if (code.includes('import os') && code.includes('system')) {
      errors.push('Direct os.system() usage is blocked');
    }

    if (code.includes('__import__')) {
      errors.push('Dynamic imports via __import__ are blocked');
    }
  }

  private validateJavaScriptCode(
    code: string,
    errors: string[],
  ): void {
    for (const pattern of this.blockedJavaScriptPatterns) {
      if (pattern.test(code)) {
        errors.push(`Blocked JavaScript pattern detected: ${pattern}`);
      }
    }
  }

  private parseMemoryToBytes(memory: string): number {
    const match = memory.match(/^(\d+)([KMGT]?i?)$/i);
    if (!match) return 0;

    const value = parseInt(match[1], 10);
    const unit = match[2]?.toUpperCase() || 'B';

    switch (unit) {
      case 'KI':
        return value * 1024;
      case 'MI':
        return value * 1024 * 1024;
      case 'GI':
        return value * 1024 * 1024 * 1024;
      case 'TI':
        return value * 1024 * 1024 * 1024 * 1024;
      default:
        return value;
    }
  }

  /**
   * Validate JavaScript/TypeScript code using AST
   */
  private async validateJavaScriptAST(
    code: string,
    errors: string[],
    warnings: string[],
  ): Promise<void> {
    // Dynamic import to avoid requiring the package if not available
    const parserMod = require('@typescript-eslint/parser') as {
      parse: (code: string, opts: Record<string, unknown>) => AstNode;
    };
    const ast = parserMod.parse(code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
    });

    // Build a best-effort name -> binding-expression alias map in a single
    // pass over the whole program before the danger-detection traversal.
    // This lets the traversal resolve simple local aliases (`const F =
    // Function; F(...)`) and destructuring bindings (`const { constructor:
    // C } = obj; C(...)`) back to the same dangerous expression shapes it
    // already detects for direct syntax. This is intentionally a
    // non-exhaustive, single-pass, non-SSA heuristic (see class docs on
    // `resolveDangerousReferenceKind`), not full control-flow analysis.
    const aliasMap = this.buildAliasMap(ast);

    // Traverse AST to find dangerous patterns
    this.traverseJavaScriptAST(ast, errors, warnings, 0, aliasMap);
  }

  /**
   * Validate Python code using AST (simplified - can be enhanced with python-ast package)
   */
  private async validatePythonAST(
    code: string,
    errors: string[],
    warnings: string[],
  ): Promise<void> {
    // For now, use enhanced pattern matching
    // TODO: Integrate python-ast package for full AST parsing
    this.validatePythonCode(code, errors);

    // Check for dangerous AST patterns using regex (simplified)
    const dangerousPatterns = [
      {
        pattern: /__import__\s*\(/,
        message: 'Dynamic imports via __import__ are blocked',
      },
      {
        pattern: /eval\s*\(/,
        message: 'eval() is blocked',
      },
      {
        pattern: /exec\s*\(/,
        message: 'exec() is blocked',
      },
      {
        pattern: /compile\s*\(/,
        message: 'compile() may be dangerous',
        severity: 'warning' as const,
      },
    ];

    for (const { pattern, message, severity = 'error' } of dangerousPatterns) {
      if (pattern.test(code)) {
        if (severity === 'error') {
          errors.push(message);
        } else {
          warnings.push(message);
        }
      }
    }
  }

  /**
   * Traverse JavaScript AST to find dangerous patterns
   */
  private traverseJavaScriptAST(
    node: AstNode | null | undefined,
    errors: string[],
    warnings: string[],
    depth = 0,
    aliasMap: Map<string, AstNode> = new Map(),
  ): void {
    if (!node || depth > 100) {
      return; // Prevent infinite recursion
    }

    // Check for dangerous function calls (CallExpression) and constructions
    // (NewExpression). This is a structural/semantic check rather than a
    // literal-identifier check: it looks at what the callee *resolves
    // through*, not just whether it is literally the Identifier `Function`.
    // That covers the known Function-constructor sandbox-escape idioms:
    //   - `Function(...)`            bare call, no `new` (same capability
    //                                 as `new Function(...)` per spec)
    //   - `new Function(...)`        direct construction
    //   - `globalThis.Function(...)` / `window["Function"](...)` / etc.
    //                                 member/computed access to the global
    //   - `x.constructor(...)`       `.constructor` on any function-like
    //                                 value resolves to the global Function
    //                                 constructor
    //   - `x.constructor.constructor(...)`, `[].constructor.constructor(...)`,
    //     `"".constructor.constructor(...)`
    //                                 chained `.constructor` (Array/String/
    //                                 Object constructor -> Function
    //                                 constructor)
    if (node.type === 'CallExpression' || node.type === 'NewExpression') {
      const callee = node.callee;
      const isNew = node.type === 'NewExpression';

      if (callee?.type === 'Identifier' && !isNew && callee.name === 'eval') {
        errors.push('eval() calls are blocked');
      } else if (callee) {
        // Structural + alias-aware check: resolves the callee through simple
        // local `const`/`let` bindings and destructuring (see
        // `resolveDangerousReferenceKind`), not just its literal syntax.
        const kind = this.resolveDangerousReferenceKind(callee, aliasMap);
        if (kind) {
          errors.push(this.describeDangerousReferenceKind(kind, isNew));
        }
      }

      // Argument-scanning for known dangerous sinks: `Reflect.construct(X, ...)`,
      // `Reflect.apply(X, ...)`, and `.call`/`.apply`/`.bind` invoked on a
      // flagged reference. These pass the Function constructor / .constructor
      // chain as a value rather than calling it directly as the callee, so
      // the callee check above does not see them.
      if (node.type === 'CallExpression') {
        this.checkDangerousSinkArguments(node, errors, aliasMap);
      }
    }

    // Check for dangerous requires
    if (node.type === 'CallExpression' && node.callee?.name === 'require') {
      const arg = node.arguments?.[0];
      if (arg?.type === 'Literal' && typeof arg.value === 'string') {
        const moduleName = arg.value;
        const blockedModules = ['child_process', 'fs', 'os', 'net', 'http'];
        if (blockedModules.includes(moduleName)) {
          errors.push(`Requiring '${moduleName}' is blocked`);
        }
      }
    }

    // Recursively traverse children
    for (const key in node) {
      if (key === 'parent' || key === 'range') {
        continue;
      }
      const child = node[key];
      if (Array.isArray(child)) {
        for (const item of child) {
          this.traverseJavaScriptAST(
            item as AstNode,
            errors,
            warnings,
            depth + 1,
            aliasMap,
          );
        }
      } else if (child && typeof child === 'object') {
        this.traverseJavaScriptAST(
          child as AstNode,
          errors,
          warnings,
          depth + 1,
          aliasMap,
        );
      }
    }
  }

  /**
   * Build a best-effort name -> binding-expression alias map for the whole
   * program in a single pass, so the danger-detection traversal can resolve
   * simple local aliases back to the expression they were bound from.
   *
   * This is intentionally NOT full control-flow/SSA analysis: it is a
   * single-pass, non-exhaustive heuristic that finds `VariableDeclarator`
   * nodes anywhere in the program and records `id.name -> init` (for a bare
   * `const`/`let` identifier) or, for destructuring (`const { constructor:
   * C } = obj`), records a synthetic "member access on <key> of <init>"
   * marker node so that later resolution treats `C` the same as a direct
   * `.constructor` access. Reassignment, shadowing across scopes, and
   * control-flow-dependent bindings are out of scope for this pass.
   */
  private buildAliasMap(root: AstNode): Map<string, AstNode> {
    const aliasMap = new Map<string, AstNode>();

    const visit = (node: AstNode | null | undefined, depth: number): void => {
      if (!node || depth > 200) {
        return;
      }

      if (node.type === 'VariableDeclarator') {
        const id = node['id'] as AstNode | undefined;
        const init = node['init'] as AstNode | undefined;

        if (id && init) {
          if (id.type === 'Identifier' && typeof id.name === 'string') {
            aliasMap.set(id.name, init);
          } else if (id.type === 'ObjectPattern') {
            const properties =
              (id['properties'] as AstNode[] | undefined) ?? [];
            for (const prop of properties) {
              if (prop.type !== 'Property') {
                continue;
              }
              const key = prop['key'] as AstNode | undefined;
              const value = prop['value'] as AstNode | undefined;
              if (!key || !value || value.type !== 'Identifier') {
                continue;
              }
              const keyName =
                !prop['computed'] && key.type === 'Identifier'
                  ? key.name
                  : key.type === 'Literal' && typeof key.value === 'string'
                    ? key.value
                    : null;
              if (
                !keyName ||
                typeof keyName !== 'string' ||
                typeof value.name !== 'string'
              ) {
                continue;
              }
              // Synthetic marker: `value.name` is bound to a member access
              // on `keyName` of `init` (e.g. `const { constructor: C } =
              // obj` binds `C` to `obj.constructor`).
              const synthetic: AstNode = {
                type: 'MemberExpression',
                object: init,
                property: { type: 'Identifier', name: keyName },
                computed: false,
              };
              aliasMap.set(value.name, synthetic);
            }
          }
        }
      }

      for (const key in node) {
        if (key === 'parent' || key === 'range') {
          continue;
        }
        const child = node[key];
        if (Array.isArray(child)) {
          for (const item of child) {
            visit(item as AstNode, depth + 1);
          }
        } else if (child && typeof child === 'object') {
          visit(child as AstNode, depth + 1);
        }
      }
    };

    visit(root, 0);
    return aliasMap;
  }

  /**
   * Resolve whether an expression node is a dangerous reference to the
   * global Function constructor / `.constructor` escape idiom, recursively
   * following simple local aliases (see `buildAliasMap`) up to a small
   * depth cap. Returns the specific reason, or null when not dangerous by
   * these rules.
   *
   * NOTE on scope: this is a best-effort, single-pass heuristic, not full
   * SSA/control-flow analysis. It resolves the most recent matching
   * `VariableDeclarator` found anywhere in the program for a given name; it
   * does not track reassignment, block scoping, or cross-function bindings.
   */
  private resolveDangerousReferenceKind(
    node: AstNode | null | undefined,
    aliasMap: Map<string, AstNode>,
    depth = 0,
  ): DangerousReferenceKind | null {
    if (!node || depth > 5) {
      return null;
    }

    if (node.type === 'Identifier') {
      if (node.name === 'Function') {
        return 'function-identifier';
      }
      const aliasNode =
        typeof node.name === 'string' ? aliasMap.get(node.name) : undefined;
      if (aliasNode) {
        return this.resolveDangerousReferenceKind(
          aliasNode,
          aliasMap,
          depth + 1,
        );
      }
      return null;
    }

    if (node.type === 'MemberExpression') {
      const propertyName = this.getMemberExpressionPropertyName(node);
      if (propertyName === 'Function') {
        return 'function-member';
      }
      if (propertyName === 'constructor') {
        return 'constructor-member';
      }
      if (propertyName === null) {
        // Deny-by-default: a computed property key that cannot be
        // statically resolved to a literal string, accessed on
        // globalThis/window/this/Reflect-like objects, is suspicious —
        // sandboxed AI-generated eval code has no legitimate need for this
        // pattern (e.g. `globalThis["Func" + "tion"]`,
        // `globalThis[String.fromCharCode(...)]`). Ordinary computed access
        // on arrays/plain objects (`arr[i]`, `config[key]`) is unaffected
        // because the object side is not globalThis-like.
        const objectNode = node['object'] as AstNode | undefined;
        if (this.isGlobalThisLikeReference(objectNode, aliasMap, depth)) {
          return 'unresolved-global-computed';
        }
      }
      return null;
    }

    return null;
  }

  /**
   * Whether an expression node statically resolves to globalThis, window,
   * self, this, or Reflect (directly or through a simple local alias).
   * Scoped narrowly so ordinary values (arrays, plain objects, loop
   * variables) are never treated as global-like.
   */
  private isGlobalThisLikeReference(
    node: AstNode | null | undefined,
    aliasMap: Map<string, AstNode>,
    depth = 0,
  ): boolean {
    if (!node || depth > 5) {
      return false;
    }

    if (node.type === 'ThisExpression') {
      return true;
    }

    if (node.type === 'Identifier') {
      if (
        node.name === 'globalThis' ||
        node.name === 'window' ||
        node.name === 'self' ||
        node.name === 'Reflect'
      ) {
        return true;
      }
      const aliasNode =
        typeof node.name === 'string' ? aliasMap.get(node.name) : undefined;
      if (aliasNode) {
        return this.isGlobalThisLikeReference(aliasNode, aliasMap, depth + 1);
      }
    }

    return false;
  }

  /**
   * Produce the error message for a resolved dangerous callee reference.
   */
  private describeDangerousReferenceKind(
    kind: DangerousReferenceKind,
    isNew: boolean,
  ): string {
    switch (kind) {
      case 'function-identifier':
        return isNew
          ? 'new Function() calls are blocked'
          : 'Function() calls without new are blocked (a bare call to the Function constructor has the same code-execution capability as new Function()), including through a local alias (e.g. const F = Function; F(...))';
      case 'function-member':
        return 'Accessing the global Function constructor via a member expression (e.g. globalThis.Function, window["Function"]) is blocked';
      case 'constructor-member':
        return 'Accessing .constructor is blocked — it is a common sandbox-escape idiom that resolves to the global Function constructor (e.g. x.constructor(...), [].constructor.constructor(...)), including through a local alias or destructuring binding (e.g. const { constructor: C } = obj)';
      case 'unresolved-global-computed':
        return 'Computed member access with a non-statically-resolvable property key on globalThis/window/this/Reflect is blocked (e.g. globalThis["Func" + "tion"], globalThis[String.fromCharCode(...)]) — sandboxed code has no legitimate need for this pattern';
      default:
        return 'Blocked dangerous reference';
    }
  }

  /**
   * Scan call arguments for known dangerous sinks that accept the Function
   * constructor / `.constructor` chain as a value rather than calling it
   * directly: `Reflect.construct(X, ...)`, `Reflect.apply(X, ...)`, and
   * `.call`/`.apply`/`.bind` invoked on a flagged reference.
   */
  private checkDangerousSinkArguments(
    node: AstNode,
    errors: string[],
    aliasMap: Map<string, AstNode>,
  ): void {
    const callee = node.callee;
    if (!callee || callee.type !== 'MemberExpression') {
      return;
    }

    const propertyName = this.getMemberExpressionPropertyName(callee);
    const objectNode = callee['object'] as AstNode | undefined;

    const isReflectObject =
      objectNode?.type === 'Identifier' && objectNode.name === 'Reflect';

    if (
      isReflectObject &&
      (propertyName === 'construct' || propertyName === 'apply')
    ) {
      const firstArg = node.arguments?.[0];
      const kind = this.resolveDangerousReferenceKind(firstArg, aliasMap);
      if (kind) {
        errors.push(
          `Reflect.${propertyName}() invoked with a reference to the Function constructor/.constructor chain as its target is blocked`,
        );
      }
    }

    if (
      propertyName === 'call' ||
      propertyName === 'apply' ||
      propertyName === 'bind'
    ) {
      const kind = this.resolveDangerousReferenceKind(objectNode, aliasMap);
      if (kind) {
        errors.push(
          `Invoking .${propertyName}() on a reference to the Function constructor/.constructor chain is blocked`,
        );
      }
    }
  }

  /**
   * Resolve the statically-known property name of a MemberExpression,
   * regardless of whether it uses dot notation (`x.constructor`) or
   * computed/bracket notation with a string literal (`x["constructor"]`).
   * Returns null when the property name cannot be determined statically
   * (e.g. a computed access with a non-literal expression).
   */
  private getMemberExpressionPropertyName(node: AstNode): string | null {
    if (node.type !== 'MemberExpression') {
      return null;
    }

    const property = node['property'] as AstNode | undefined;
    if (!property) {
      return null;
    }

    if (!node['computed'] && property.type === 'Identifier') {
      return typeof property.name === 'string' ? property.name : null;
    }

    if (
      node['computed'] &&
      property.type === 'Literal' &&
      typeof property.value === 'string'
    ) {
      return property.value;
    }

    return null;
  }

  /**
   * Scan Python code for security issues
   */
  private scanPythonSecurityIssues(
    code: string,
    issues: SecurityIssue[],
  ): void {
    // Injection patterns
    const injectionPatterns = [
      {
        pattern: /os\.system\s*\(/,
        type: 'command_injection',
        message: 'os.system() can lead to command injection',
      },
      {
        pattern: /subprocess\.(call|run|Popen)\s*\(/,
        type: 'command_injection',
        message: 'subprocess calls can lead to command injection',
      },
      {
        pattern: /eval\s*\(/,
        type: 'code_injection',
        message: 'eval() can execute arbitrary code',
      },
      {
        pattern: /exec\s*\(/,
        type: 'code_injection',
        message: 'exec() can execute arbitrary code',
      },
      {
        pattern: /pickle\.(loads?|dumps?)\s*\(/,
        type: 'unsafe_deserialization',
        message: 'pickle can execute arbitrary code during deserialization',
      },
      {
        pattern: /yaml\.(load|load_all)\s*\(/,
        type: 'unsafe_deserialization',
        message: 'yaml.load() can execute arbitrary code',
        severity: 'warning' as const,
      },
    ];

    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { pattern, type, message, severity = 'error' } of
        injectionPatterns) {
        if (pattern.test(line)) {
          issues.push({
            severity,
            type,
            message,
            line: i + 1,
          });
        }
      }
    }
  }

  /**
   * Scan JavaScript code for security issues
   */
  private scanJavaScriptSecurityIssues(
    code: string,
    issues: SecurityIssue[],
  ): void {
    const securityPatterns = [
      {
        pattern: /eval\s*\(/,
        type: 'code_injection',
        message: 'eval() can execute arbitrary code',
      },
      {
        pattern: /new\s+Function\s*\(/,
        type: 'code_injection',
        message: 'new Function() can execute arbitrary code',
      },
      {
        pattern: /\bFunction\s*\(/,
        type: 'code_injection',
        message:
          'Function() (with or without new) can execute arbitrary code',
      },
      {
        pattern:
          /(?:globalThis|window|self|this)\s*(?:\.\s*Function\b|\[\s*['"]Function['"]\s*\])/,
        type: 'code_injection',
        message:
          'Accessing the global Function constructor via member/computed access can execute arbitrary code',
      },
      {
        pattern: /\.\s*constructor\b|\[\s*['"]constructor['"]\s*\]/,
        type: 'code_injection',
        message:
          '.constructor access is a common sandbox-escape idiom that can reach the Function constructor',
      },
      {
        pattern: /innerHTML\s*=/,
        type: 'xss',
        message: 'innerHTML assignment can lead to XSS',
        severity: 'warning' as const,
      },
      {
        pattern: /dangerouslySetInnerHTML/,
        type: 'xss',
        message: 'dangerouslySetInnerHTML can lead to XSS',
        severity: 'warning' as const,
      },
      {
        pattern: /require\s*\(\s*['"]child_process['"]/,
        type: 'command_injection',
        message: 'child_process module can execute system commands',
      },
    ];

    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { pattern, type, message, severity = 'error' } of
        securityPatterns) {
        if (pattern.test(line)) {
          issues.push({
            severity,
            type,
            message,
            line: i + 1,
          });
        }
      }
    }
  }

  /**
   * Validate FQDN format
   */
  private isValidFQDN(domain: string): boolean {
    const fqdnRegex =
      /^(?:(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}|localhost)$/i;
    return fqdnRegex.test(domain);
  }

  /**
   * Validate domain format (less strict than FQDN)
   */
  private isValidDomain(domain: string): boolean {
    const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
    return domainRegex.test(domain) || domain === 'localhost';
  }

  /**
   * Validate CIDR notation
   */
  private isValidCIDR(cidr: string): boolean {
    const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
    if (!cidrRegex.test(cidr)) {
      return false;
    }

    const [ip, prefix] = cidr.split('/');
    const prefixNum = parseInt(prefix, 10);
    if (prefixNum < 0 || prefixNum > 32) {
      return false;
    }

    const parts = ip.split('.').map(Number);
    return (
      parts.length === 4 &&
      parts.every((part) => part >= 0 && part <= 255)
    );
  }
}
