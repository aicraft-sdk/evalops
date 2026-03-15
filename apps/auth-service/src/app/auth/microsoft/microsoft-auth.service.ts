import { Injectable } from '@nestjs/common';
import * as msal from '@azure/msal-node';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MicrosoftAuthService {
  private msalInstance: msal.ConfidentialClientApplication | null = null;
  private config: {
    clientId: string;
    clientSecret: string;
    tenantId: string;
    redirectUri: string;
    scopes: string[];
  } | null = null;

  constructor(private configService: ConfigService) {
    this.initializeConfig();
  }

  private initializeConfig() {
    const clientId = this.configService.get('MICROSOFT_CLIENT_ID');
    const clientSecret = this.configService.get('MICROSOFT_CLIENT_SECRET');
    const tenantId = this.configService.get('MICROSOFT_TENANT_ID');
    const redirectUri =
      this.configService.get('MICROSOFT_REDIRECT_URI') ||
      'http://localhost:3000/api/auth/microsoft/callback';

    if (!clientId || !clientSecret || !tenantId) {
      console.warn(
        'Microsoft Entra ID configuration incomplete. SSO will not be available.',
      );
      return;
    }

    this.config = {
      clientId,
      clientSecret,
      tenantId,
      redirectUri,
      scopes: ['openid', 'profile', 'email', 'User.Read', 'Directory.Read.All'],
    };

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
        },
      },
    };

    this.msalInstance = new msal.ConfidentialClientApplication(msalConfig);
  }

  isConfigured(): boolean {
    return this.msalInstance !== null && this.config !== null;
  }

  async getLoginUrl(state?: string): Promise<string> {
    if (!this.msalInstance || !this.config) {
      throw new Error('Microsoft Entra ID not configured');
    }

    const authCodeUrlParameters: msal.AuthorizationUrlRequest = {
      scopes: this.config.scopes,
      redirectUri: this.config.redirectUri,
      state: state || `state_${Date.now()}`,
      prompt: msal.PromptValue.SELECT_ACCOUNT,
    };

    return await this.msalInstance.getAuthCodeUrl(authCodeUrlParameters);
  }

  async handleCallback(code: string): Promise<{
    user: {
      oid: string;
      upn: string;
      name: string;
      given_name?: string;
      family_name?: string;
      email?: string;
      preferred_username?: string;
      tid: string;
      roles?: string[];
    };
    accessToken: string;
  }> {
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

      const user = {
        oid: account.localAccountId,
        upn: account.username,
        name: account.name || idTokenClaims.name || '',
        given_name: idTokenClaims.given_name,
        family_name: idTokenClaims.family_name,
        email: idTokenClaims.email || account.username,
        preferred_username: idTokenClaims.preferred_username,
        tid: account.tenantId,
        roles: idTokenClaims.roles || [],
      };

      return {
        user,
        accessToken: response.accessToken || '',
      };
    } catch (error: any) {
      throw new Error(`Microsoft Entra ID callback error: ${error.message}`);
    }
  }

  async getUserProfile(accessToken: string): Promise<any> {
    try {
      const response = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Graph API error: ${response.status}`);
      }

      return await response.json();
    } catch (error: any) {
      console.error('Error fetching user profile from Graph API:', error);
      return null;
    }
  }
}

