/**
 * API Route Mappings for Microservices Architecture
 * Maps old endpoints to new API Gateway service routes
 */

const SERVICE_ROUTES: Record<string, string> = {
  // Auth Service
  '/api/auth': '/api/auth',
  '/api/user': '/api/auth/user',
  '/api/login': '/api/auth/login',
  '/api/logout': '/api/auth/logout',
  '/api/register': '/api/auth/register',
  '/api/users': '/api/auth/users',
  '/api/organizations': '/api/auth/organizations',
  '/api/permissions': '/api/auth/permissions',

  // Core Service
  '/api/prompts': '/api/core/prompts',
  '/api/flows': '/api/core/flows',
  '/api/datasets': '/api/core/datasets',
  '/api/eval-specs': '/api/core/eval-specs',
  '/api/prompt-templates': '/api/core/prompt-templates',

  // Evaluation Service
  '/api/runs': '/api/evaluation/runs',
  '/api/baselines': '/api/evaluation/baselines',
  '/api/policies': '/api/evaluation/policies',
  '/api/policy-violations': '/api/evaluation/policy-violations',
  '/api/evaluations': '/api/evaluation/evaluations',
  '/api/python-worker': '/api/evaluation/python-worker',
  '/api/simulations': '/api/evaluation/simulations',
  '/api/reviews': '/api/evaluation/reviews',

  // Analytics Service
  '/api/analytics': '/api/analytics',
  '/api/audit-trail': '/api/analytics/audit-trail',
  '/api/dashboard': '/api/analytics/dashboard',

  // Integration Service
  '/api/webhooks': '/api/integration/webhooks',
  '/api/alerts': '/api/integration/alerts',
  '/api/azure': '/api/integration/azure',
  '/api/cicd': '/api/integration/cicd',

  // Core Service - Agents
  '/api/agents': '/api/core/agents',

  // Integration Service - Artifacts
  '/api/artifacts': '/api/integration/artifacts',

  // Core Service - Providers and Models
  '/api/providers': '/api/core/providers',
  '/api/models': '/api/core/models',

  // Auth Service - Admin
  '/api/admin': '/api/auth/admin',
};

/**
 * Maps an API endpoint to the correct service route via API Gateway
 */
export function mapApiRoute(path: string): string {
  // Check for exact matches first
  if (SERVICE_ROUTES[path]) {
    return SERVICE_ROUTES[path];
  }

  // Check for path prefixes
  for (const [oldPath, newPath] of Object.entries(SERVICE_ROUTES)) {
    if (path.startsWith(oldPath)) {
      // Replace the old prefix with the new one
      return path.replace(oldPath, newPath);
    }
  }

  // Default: assume it's a core service endpoint
  if (
    path.startsWith('/api/') &&
    !path.startsWith('/api/auth') &&
    !path.startsWith('/api/core') &&
    !path.startsWith('/api/evaluation') &&
    !path.startsWith('/api/analytics') &&
    !path.startsWith('/api/integration')
  ) {
    return `/api/core${path.replace('/api', '')}`;
  }

  // Return as-is if no mapping found
  return path;
}

/**
 * Helper to get the base API URL
 */
export function getApiBaseUrl(): string {
  // In development, API Gateway runs on port 3000
  // In production, this would be the API Gateway URL
  return process.env.VITE_API_URL || '';
}
