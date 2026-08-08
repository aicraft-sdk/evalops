import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Network egress policy configuration
 */
export interface NetworkPolicy {
  egressPolicy: 'deny_all' | 'allow_all' | 'restricted';
  allowedDomains: string[]; // FQDN allowlist
  blockedDomains: string[]; // Domain blocklist
  blockedIPRanges: string[]; // Internal IP ranges (CIDR notation)
}

/**
 * Resource limit policy configuration
 */
export interface ResourcePolicy {
  maxCpu: number;
  maxMemory: string; // e.g., "2Gi"
  maxTimeout: number; // seconds
  maxConcurrent: number; // Maximum concurrent sandboxes per organization
}

/**
 * Code validation rules configuration
 */
export interface CodeValidationPolicy {
  maxCodeSize: number; // Maximum code size in characters
  allowedImports: string[]; // Allowed import patterns
  blockedImports: string[]; // Blocked import patterns
  requireASTValidation: boolean; // Whether to use AST-based validation
}

/**
 * Centralized sandbox security policies
 *
 * Provides network policy, resource policy, and code validation policy configuration.
 * Policies are loaded from environment variables and can be validated.
 */
@Injectable()
export class SandboxPolicies {
  private readonly networkPolicy: NetworkPolicy;
  private readonly resourcePolicy: ResourcePolicy;
  private readonly codeValidationPolicy: CodeValidationPolicy;

  constructor(private readonly configService: ConfigService) {
    // Load network policy from environment
    const egressPolicy =
      (this.configService.get<string>('OPENSANDBOX_NETWORK_POLICY') ||
        'restricted') as 'deny_all' | 'allow_all' | 'restricted';

    const allowedDomainsStr =
      this.configService.get<string>('OPENSANDBOX_ALLOWED_DOMAINS') ||
      'api.openai.com,api.anthropic.com,generativelanguage.googleapis.com';
    const allowedDomains = allowedDomainsStr
      .split(',')
      .map((d) => d.trim())
      .filter((d) => d.length > 0);

    const blockedDomainsStr =
      this.configService.get<string>('OPENSANDBOX_BLOCKED_DOMAINS') ||
      'localhost,127.0.0.1,internal.evalops.local';
    const blockedDomains = blockedDomainsStr
      .split(',')
      .map((d) => d.trim())
      .filter((d) => d.length > 0);

    // Internal IP ranges to block
    const blockedIPRanges = [
      '10.0.0.0/8', // Private network
      '172.16.0.0/12', // Private network
      '192.168.0.0/16', // Private network
      '127.0.0.0/8', // Loopback
    ];

    this.networkPolicy = {
      egressPolicy,
      allowedDomains,
      blockedDomains,
      blockedIPRanges,
    };

    // Load resource policy from environment
    const maxCpu =
      this.configService.get<number>('OPENSANDBOX_MAX_CPU') || 2.0;
    const maxMemory =
      this.configService.get<string>('OPENSANDBOX_MAX_MEMORY') || '2Gi';
    const maxTimeout =
      this.configService.get<number>('OPENSANDBOX_MAX_TIMEOUT') || 600;
    const maxConcurrent =
      this.configService.get<number>('OPENSANDBOX_MAX_CONCURRENT') || 10;

    this.resourcePolicy = {
      maxCpu,
      maxMemory,
      maxTimeout,
      maxConcurrent,
    };

    // Load code validation policy
    const maxCodeSize = 100000; // 100KB max
    const allowedImports: string[] = []; // Empty = allow all except blocked
    const blockedImports = [
      // Python dangerous imports
      'os.system',
      'subprocess',
      'eval',
      'exec',
      '__import__',
      // JavaScript dangerous imports
      'child_process',
      'fs',
      'os',
    ];
    const requireASTValidation =
      this.configService.get<boolean>(
        'OPENSANDBOX_REQUIRE_AST_VALIDATION',
      ) ?? true;

    this.codeValidationPolicy = {
      maxCodeSize,
      allowedImports,
      blockedImports,
      requireASTValidation,
    };
  }

  /**
   * Get network policy configuration
   */
  getNetworkPolicy(): NetworkPolicy {
    return { ...this.networkPolicy };
  }

  /**
   * Get resource policy configuration
   */
  getResourcePolicy(): ResourcePolicy {
    return { ...this.resourcePolicy };
  }

  /**
   * Get code validation policy configuration
   */
  getCodeValidationPolicy(): CodeValidationPolicy {
    return { ...this.codeValidationPolicy };
  }

  /**
   * Validate domain against network policy
   */
  validateDomain(domain: string): {
    allowed: boolean;
    reason?: string;
  } {
    // Normalize domain (remove protocol, port, path)
    const normalizedDomain = domain
      .replace(/^https?:\/\//, '')
      .replace(/^\/+/, '')
      .split('/')[0]
      .split(':')[0]
      .toLowerCase();

    // Check blocklist first
    for (const blocked of this.networkPolicy.blockedDomains) {
      if (
        normalizedDomain === blocked ||
        normalizedDomain.endsWith(`.${blocked}`)
      ) {
        return {
          allowed: false,
          reason: `Domain ${domain} is in blocklist`,
        };
      }
    }

    // If egress policy is deny_all, block everything
    if (this.networkPolicy.egressPolicy === 'deny_all') {
      return {
        allowed: false,
        reason: 'Network egress policy is deny_all',
      };
    }

    // If egress policy is allow_all, allow everything (except blocklist)
    if (this.networkPolicy.egressPolicy === 'allow_all') {
      return { allowed: true };
    }

    // If egress policy is restricted, check allowlist
    if (this.networkPolicy.egressPolicy === 'restricted') {
      for (const allowed of this.networkPolicy.allowedDomains) {
        if (
          normalizedDomain === allowed ||
          normalizedDomain.endsWith(`.${allowed}`)
        ) {
          return { allowed: true };
        }
      }
      return {
        allowed: false,
        reason: `Domain ${domain} is not in allowlist`,
      };
    }

    return { allowed: false, reason: 'Unknown network policy' };
  }

  /**
   * Validate IP address against blocked IP ranges
   */
  validateIP(ip: string): { allowed: boolean; reason?: string } {
    // Simple CIDR check for common private ranges
    const ipParts = ip.split('.').map(Number);
    if (ipParts.length !== 4) {
      return { allowed: true }; // Not a valid IPv4, let it through
    }

    // Check against common private ranges
    for (const range of this.networkPolicy.blockedIPRanges) {
      if (this.isIPInRange(ip, range)) {
        return {
          allowed: false,
          reason: `IP ${ip} is in blocked range ${range}`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Check if IP is in CIDR range (simplified implementation)
   */
  private isIPInRange(ip: string, cidr: string): boolean {
    const [rangeIP, prefixLength] = cidr.split('/');
    const prefix = parseInt(prefixLength, 10);

    const ipParts = ip.split('.').map(Number);
    const rangeParts = rangeIP.split('.').map(Number);

    if (ipParts.length !== 4 || rangeParts.length !== 4) {
      return false;
    }

    // Calculate network mask
    const mask = 0xffffffff << (32 - prefix);
    const ipNum =
      (ipParts[0] << 24) |
      (ipParts[1] << 16) |
      (ipParts[2] << 8) |
      ipParts[3];
    const rangeNum =
      (rangeParts[0] << 24) |
      (rangeParts[1] << 16) |
      (rangeParts[2] << 8) |
      rangeParts[3];

    return (ipNum & mask) === (rangeNum & mask);
  }
}
