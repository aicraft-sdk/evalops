import { Request } from 'express';

/**
 * Extracts JWT token from NestJS/Express request
 * @param request - The HTTP request object
 * @returns The JWT token if found, undefined otherwise
 */
export function extractTokenFromRequest(
  request: Request,
): string | undefined {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    return undefined;
  }

  // Support both "Bearer <token>" and just "<token>" formats
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return authHeader;
}

