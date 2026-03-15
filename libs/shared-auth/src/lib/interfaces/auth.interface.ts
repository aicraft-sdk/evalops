export interface JwtPayload {
  sub: string; // user ID
  email?: string;
  organizationId?: string;
  roles?: string[];
  iat?: number;
  exp?: number;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  organizationId: string;
  roles?: string[];
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

