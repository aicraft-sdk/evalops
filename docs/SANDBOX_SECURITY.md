# Sandbox Security Documentation

This document describes the comprehensive security hardening implemented in Phase 5 of the OpenSandbox integration. It covers network policies, resource limits, code validation, audit logging, and monitoring.

## Overview

The sandbox security system provides multiple layers of protection:

1. **Network Security**: FQDN-based allowlist, internal service blocking
2. **Resource Limits**: CPU, memory, and timeout enforcement
3. **Code Validation**: AST-based analysis and security scanning
4. **Audit Logging**: Comprehensive operation tracking
5. **Monitoring**: Metrics tracking and anomaly detection

## Network Security

### Network Policies

Sandbox network egress is controlled by three policy types:

- **`deny_all`**: Block all outbound network traffic
- **`allow_all`**: Allow all outbound traffic (development only)
- **`restricted`**: Allow only domains in the allowlist

### Configuration

Network policies are configured via environment variables:

```env
OPENSANDBOX_NETWORK_POLICY=restricted
OPENSANDBOX_ALLOWED_DOMAINS=api.openai.com,api.anthropic.com,generativelanguage.googleapis.com
OPENSANDBOX_BLOCKED_DOMAINS=localhost,127.0.0.1,internal.evalops.local
```

### Domain Validation

- **FQDN Format**: Allowed domains must be valid FQDNs (e.g., `api.openai.com`)
- **Blocklist Check**: Blocked domains are checked first (takes precedence)
- **IP Range Blocking**: Internal IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) are automatically blocked

### Example

```typescript
// Valid: Domain is in allowlist
const config = {
  networkPolicy: 'restricted',
  allowedDomains: ['api.openai.com'],
};

// Invalid: Domain not in allowlist
const invalidConfig = {
  networkPolicy: 'restricted',
  allowedDomains: ['malicious-site.com'], // Will be rejected
};
```

## Resource Limits

### Configuration

Resource limits are enforced per organization and configured via environment variables:

```env
OPENSANDBOX_MAX_CPU=2.0
OPENSANDBOX_MAX_MEMORY=2Gi
OPENSANDBOX_MAX_TIMEOUT=600
OPENSANDBOX_MAX_CONCURRENT=10
```

### Limits

- **CPU**: Maximum CPU cores per sandbox (default: 2.0)
- **Memory**: Maximum memory per sandbox (default: 2Gi)
- **Timeout**: Maximum execution time in seconds (default: 600)
- **Concurrent**: Maximum concurrent sandboxes per organization (default: 10)

### Validation

Resource limits are validated before sandbox creation:

```typescript
const validation = securityService.checkResourceLimits({
  cpu: '3.0', // Exceeds max (2.0)
  memory: '4Gi', // Exceeds max (2Gi)
  timeout: 1200, // Exceeds max (600)
});
// Returns: { valid: false, errors: [...] }
```

## Code Validation

### Pattern-Based Validation

Basic validation uses pattern matching to detect dangerous operations:

**Python Blocked Patterns**:
- `os.system`, `subprocess`, `eval`, `exec`
- `__import__`, `open()`, `file()`, `input()`

**JavaScript Blocked Patterns**:
- `eval()`, `new Function()`
- `require('child_process')`, `require('fs')`, `require('os')`
- `process.exec`, `process.spawn`

### AST-Based Validation

Advanced validation uses Abstract Syntax Tree (AST) parsing for deeper analysis:

```env
OPENSANDBOX_REQUIRE_AST_VALIDATION=true
```

**Requirements**:
- `@typescript-eslint/parser` for JavaScript/TypeScript AST parsing
- Falls back to pattern matching if AST parser is unavailable

**Benefits**:
- Detects dangerous patterns beyond simple string matching
- Validates import statements
- Identifies code injection patterns

### Security Scanning

Security scanning detects various vulnerability patterns:

**Injection Patterns**:
- Command injection (`os.system`, `subprocess`)
- Code injection (`eval`, `exec`)
- XSS patterns (`innerHTML`, `dangerouslySetInnerHTML`)

**Unsafe Operations**:
- Unsafe deserialization (`pickle.loads`, `yaml.load`)
- File system access
- Network operations

### Example

```typescript
// Pattern-based validation
const validation = securityService.validateCode(code, 'python');

// AST-based validation (if enabled)
const astValidation = await securityService.validateCodeWithAST(code, 'python');

// Security scanning
const issues = securityService.scanForSecurityIssues(code, 'python');
// Returns: [{ severity: 'error', type: 'command_injection', message: '...', line: 5 }]
```

## Audit Logging

### Audit Log Schema

All sandbox operations are logged to the `sandbox_audit_log` table:

```typescript
interface SandboxAuditLog {
  id: string;
  sandboxId: string;
  operation: 'create' | 'execute' | 'delete' | 'security_violation';
  userId: string;
  organizationId: string;
  resourceUsage?: {
    cpu: number;
    memory: number;
    executionTime: number;
  };
  securityViolations?: string[];
  codeHash?: string; // SHA-256 hash
  requestId: string; // Correlation ID
  createdAt: Date;
}
```

### Logged Operations

- **Create**: Sandbox creation with configuration
- **Execute**: Code execution with resource usage and security violations
- **Delete**: Sandbox deletion
- **Security Violation**: Security policy violations

### Code Hashing

Executed code is hashed using SHA-256 for:
- Anomaly detection (repeated code patterns)
- Security analysis
- Audit trail integrity

### Request Correlation

All audit logs include `requestId` (from `x-request-id` header) for:
- Tracing requests across services
- Debugging issues
- Correlating logs

## Monitoring

### Metrics Tracked

The monitoring service tracks the following metrics per organization:

- **Creation Count**: Number of sandboxes created
- **Execution Count**: Number of code executions
- **Average Execution Time**: Mean execution duration (ms)
- **Average CPU Usage**: Mean CPU usage per execution
- **Average Memory Usage**: Mean memory usage per execution (bytes)
- **Security Violation Count**: Number of security violations
- **Failure Rate**: Percentage of failed executions (0-1)
- **Resource Limit Violations**: Number of resource limit violations

### Anomaly Detection

Anomaly detection identifies suspicious patterns:

**Excessive Resource Usage**:
- CPU usage exceeds threshold (default: 80%)
- Memory usage exceeds threshold
- Execution time unusually high

**Repeated Failures**:
- Failure rate exceeds 50%
- Repeated security violations (>10)

**Suspicious Code Patterns**:
- Same code hash executed many times (>20)
- Unusual execution times

### Prometheus Metrics

Metrics are available in Prometheus-compatible format:

```
evalops_sandbox_creation_count{organization_id="..."} 10
evalops_sandbox_execution_count{organization_id="..."} 50
evalops_sandbox_avg_execution_time_ms{organization_id="..."} 1234.56
evalops_sandbox_security_violations{organization_id="..."} 2
evalops_sandbox_failure_rate{organization_id="..."} 0.05
```

### Configuration

```env
OPENSANDBOX_ENABLE_MONITORING=true
OPENSANDBOX_ANOMALY_DETECTION=true
OPENSANDBOX_RESOURCE_ALERT_THRESHOLD=0.8
```

## Security Best Practices

### Development

1. **Use `allow_all` network policy** for local development
2. **Disable AST validation** if parser is unavailable: `OPENSANDBOX_REQUIRE_AST_VALIDATION=false`
3. **Monitor logs** for security violations during development

### Production

1. **Use `restricted` network policy** with explicit allowlist
2. **Enable AST validation** for deeper code analysis
3. **Enable monitoring and anomaly detection**
4. **Review audit logs** regularly for security violations
5. **Set appropriate resource limits** based on workload
6. **Monitor metrics** for unusual patterns

### Network Configuration

**Recommended Production Setup**:

```env
OPENSANDBOX_NETWORK_POLICY=restricted
OPENSANDBOX_ALLOWED_DOMAINS=api.openai.com,api.anthropic.com,generativelanguage.googleapis.com
OPENSANDBOX_BLOCKED_DOMAINS=localhost,127.0.0.1,internal.evalops.local
```

**Blocked by Default**:
- Internal IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
- Localhost and loopback addresses
- Internal service domains

### Resource Limits

**Recommended Production Limits**:

```env
OPENSANDBOX_MAX_CPU=2.0
OPENSANDBOX_MAX_MEMORY=2Gi
OPENSANDBOX_MAX_TIMEOUT=600
OPENSANDBOX_MAX_CONCURRENT=10
```

Adjust based on:
- Expected workload
- Organization tier
- Cost constraints

## Troubleshooting

### Network Policy Violations

**Error**: `Network policy validation failed: Domain example.com is not in allowlist`

**Solution**: Add the domain to `OPENSANDBOX_ALLOWED_DOMAINS` or use `allow_all` for development.

### Resource Limit Violations

**Error**: `CPU limit 3.0 exceeds maximum 2.0`

**Solution**: Reduce requested resources or increase `OPENSANDBOX_MAX_CPU`.

### AST Validation Failures

**Error**: `AST validation not available, using pattern matching`

**Solution**: Install `@typescript-eslint/parser`:
```bash
npm install --save-dev @typescript-eslint/parser
```

### Audit Logging Failures

Audit logging failures are non-fatal and won't break sandbox operations. Check logs for:
- Database connection issues
- Schema migration status
- Permission errors

## API Reference

### SandboxSecurityService

```typescript
// Validate code
validateCode(code: string, language: string): ValidationResult

// Validate code with AST
validateCodeWithAST(code: string, language: string): Promise<ValidationResult>

// Scan for security issues
scanForSecurityIssues(code: string, language: string): SecurityIssue[]

// Validate network policy
validateNetworkPolicy(policy: NetworkPolicy): ValidationResult

// Check resource limits
checkResourceLimits(config: { cpu?: string; memory?: string; timeout?: number }): ValidationResult
```

### SandboxAuditService

```typescript
// Log operation
logOperation(context: AuditLogContext): Promise<string>

// Log creation
logCreation(sandboxId: string, userId: string, organizationId: string, requestId?: string): Promise<string>

// Log execution
logExecution(sandboxId: string, userId: string, organizationId: string, code: string, resourceUsage?: ResourceUsage, securityViolations?: string[], requestId?: string): Promise<string>

// Log deletion
logDeletion(sandboxId: string, userId: string, organizationId: string, requestId?: string): Promise<string>

// Log security violation
logSecurityViolation(sandboxId: string, userId: string, organizationId: string, violations: string[], code?: string, requestId?: string): Promise<string>
```

### SandboxMonitoringService

```typescript
// Record creation
recordCreation(organizationId: string): void

// Record execution
recordExecution(organizationId: string, resourceUsage?: ResourceUsage, success?: boolean): void

// Record security violation
recordSecurityViolation(organizationId: string): void

// Get metrics
getMetrics(organizationId: string): SandboxMetrics

// Detect anomalies
detectAnomalies(organizationId: string, sandboxId?: string): Promise<AnomalyDetectionResult>

// Get Prometheus metrics
getPrometheusMetrics(organizationId: string): string
```

## Related Documentation

- [OPENSANDBOX_SETUP.md](./OPENSANDBOX_SETUP.md) - OpenSandbox server setup
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
- [AGENTS.md](../AGENTS.md) - Agent instructions
