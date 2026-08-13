export const SSO_USER_PROVISIONER = Symbol('SSO_USER_PROVISIONER');

export interface EntraUserProfile {
  oid: string;
  upn: string;
  name: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  preferred_username?: string;
  tid: string;
  roles?: string[];
}

/**
 * Delegates user provisioning + JWT issuance to the consuming app (auth-service), so
 * ee/sso never has a compile-time import of anything inside apps/auth-service — mirrors
 * PAT_VALIDATOR in libs/shared-auth/src/lib/guards/api-auth.guard.ts.
 */
export interface SsoUserProvisioner {
  findUserByEmail(email: string): Promise<{ id: string } | null>;
  createUserFromMicrosoft(profile: EntraUserProfile): Promise<{ id: string }>;
  updateUserFromMicrosoft(userId: string, profile: EntraUserProfile): Promise<{ id: string }>;
  login(user: { id: string }): Promise<{ access_token: string }>;
}
