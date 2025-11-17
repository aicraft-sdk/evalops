import * as msal from '@azure/msal-node';
import { Request, Response, RequestHandler } from 'express';

interface EntraIdUser {
  oid: string; // Object ID (unique user identifier)
  upn: string; // User Principal Name  
  name: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  preferred_username?: string;
  tid: string; // Tenant ID
  roles?: string[];
  department?: string;
  jobTitle?: string;
}

interface EntraIdConfig {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  redirectUri: string;
  scopes: string[];
}

export class MicrosoftEntraAuthService {
  private msalInstance: msal.ConfidentialClientApplication | null = null;
  private config: EntraIdConfig | null = null;

  constructor() {
    this.initializeConfig();
  }

  private initializeConfig() {
    // Load configuration from environment variables
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    const tenantId = process.env.MICROSOFT_TENANT_ID;
    const redirectUri = process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:5000/api/auth/microsoft/callback';

    if (!clientId || !clientSecret || !tenantId) {
      console.warn('Microsoft Entra ID configuration incomplete. SSO will not be available.');
      return;
    }

    this.config = {
      clientId,
      clientSecret,
      tenantId,
      redirectUri,
      scopes: ['openid', 'profile', 'email', 'User.Read', 'Directory.Read.All']
    };

    // Initialize MSAL instance
    const msalConfig = {
      auth: {
        clientId,
        clientSecret,
        authority: `https://login.microsoftonline.com/${tenantId}`,
      },
      system: {
        loggerOptions: {
          loggerCallback: (level: msal.LogLevel, message: string) => {
            if (level <= msal.LogLevel.Error) {
              console.error('MSAL Error:', message);
            }
          },
          piiLoggingEnabled: false,
          logLevel: msal.LogLevel.Warning,
        }
      }
    };

    this.msalInstance = new msal.ConfidentialClientApplication(msalConfig);
  }

  /**
   * Check if Microsoft Entra ID is properly configured
   */
  isConfigured(): boolean {
    return this.msalInstance !== null && this.config !== null;
  }

  /**
   * Generate the Microsoft login URL
   */
  getLoginUrl(state?: string): string {
    if (!this.msalInstance || !this.config) {
      throw new Error('Microsoft Entra ID not configured');
    }

    const authCodeUrlParameters = {
      scopes: this.config.scopes,
      redirectUri: this.config.redirectUri,
      state: state || `state_${Date.now()}`,
      prompt: 'select_account' as msal.PromptValue,
    };

    return this.msalInstance.getAuthCodeUrl(authCodeUrlParameters);
  }

  /**
   * Handle the OAuth callback and exchange code for tokens
   */
  async handleCallback(code: string, state: string): Promise<EntraIdUser> {
    if (!this.msalInstance || !this.config) {
      throw new Error('Microsoft Entra ID not configured');
    }

    try {
      const tokenRequest = {
        code,
        scopes: this.config.scopes,
        redirectUri: this.config.redirectUri,
      };

      const response = await this.msalInstance.acquireTokenByCode(tokenRequest);
      
      if (!response || !response.account) {
        throw new Error('Failed to authenticate with Microsoft Entra ID');
      }

      // Extract user information from the ID token
      const idTokenClaims = response.idTokenClaims as any;
      const account = response.account;

      const user: EntraIdUser = {
        oid: account.localAccountId, // Object ID
        upn: account.username, // User Principal Name
        name: account.name || idTokenClaims.name || '',
        given_name: idTokenClaims.given_name,
        family_name: idTokenClaims.family_name,
        email: idTokenClaims.email || account.username,
        preferred_username: idTokenClaims.preferred_username,
        tid: account.tenantId, // Tenant ID
        roles: idTokenClaims.roles || [],
        department: idTokenClaims.department,
        jobTitle: idTokenClaims.jobTitle,
      };

      return user;
    } catch (error) {
      console.error('Microsoft Entra ID callback error:', error);
      throw new Error('Authentication failed');
    }
  }

  /**
   * Get additional user profile information using Microsoft Graph
   */
  async getUserProfile(accessToken: string): Promise<any> {
    try {
      const response = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Graph API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching user profile from Graph API:', error);
      return null;
    }
  }

  /**
   * Get user's group memberships for role mapping
   */
  async getUserGroups(accessToken: string): Promise<string[]> {
    try {
      const response = await fetch('https://graph.microsoft.com/v1.0/me/memberOf', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Graph API error: ${response.status}`);
      }

      const data = await response.json();
      return data.value?.map((group: any) => group.displayName) || [];
    } catch (error) {
      console.error('Error fetching user groups from Graph API:', error);
      return [];
    }
  }

  /**
   * Logout user by clearing tokens
   */
  async logout(accountId: string): Promise<string> {
    if (!this.msalInstance || !this.config) {
      throw new Error('Microsoft Entra ID not configured');
    }

    // Generate logout URL
    return `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/logout`;
  }

  /**
   * Middleware to check if request is authenticated via Microsoft Entra ID
   */
  requireAuth(): RequestHandler {
    return (req: Request, res: Response, next) => {
      // Check if user has valid Microsoft Entra ID session
      const user = (req as any).user;
      
      if (!user || !user.entraId) {
        return res.status(401).json({ 
          message: 'Microsoft Entra ID authentication required',
          authUrl: this.isConfigured() ? '/api/auth/microsoft' : null
        });
      }

      next();
    };
  }
}

// Export singleton instance
export const microsoftAuth = new MicrosoftEntraAuthService();