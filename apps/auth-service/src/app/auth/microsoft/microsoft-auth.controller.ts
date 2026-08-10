import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { MicrosoftAuthService } from './microsoft-auth.service';
import { Public } from '@evalops/shared-auth';
import { AuthService } from '../auth.service';

@Controller('auth/microsoft')
export class MicrosoftAuthController {
  constructor(
    private microsoftAuthService: MicrosoftAuthService,
    private authService: AuthService
  ) {}

  @Public()
  @Get()
  async login(@Res() res: Response) {
    if (!this.microsoftAuthService.isConfigured()) {
      return res.status(501).json({
        message:
          'Microsoft Entra ID not configured. Please contact your administrator.',
      });
    }

    try {
      const loginUrl = await this.microsoftAuthService.getLoginUrl();
      return res.redirect(loginUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ message });
    }
  }

  @Public()
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response
  ) {
    if (!code) {
      return res.status(400).json({ message: 'Authorization code missing' });
    }

    try {
      const tokenResponse = await this.microsoftAuthService.handleCallback(
        code
      );

      const entraUser = tokenResponse.user;

      // Find or create user by email
      let user = await this.authService.findUserByEmail(
        entraUser.email || entraUser.upn
      );

      if (!user) {
        // Create new user from Microsoft account
        user = await this.authService.createUserFromMicrosoft(entraUser);
      } else {
        // Update existing user with Microsoft account info
        user = await this.authService.updateUserFromMicrosoft(
          user.id,
          entraUser
        );
      }

      // Generate JWT token
      const jwtToken = await this.authService.login(user);

      // Set JWT token as HTTP-only cookie
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
      res.cookie('access_token', jwtToken.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      });

      // Redirect to frontend with success
      return res.redirect(`${frontendUrl}/auth/callback?success=true`);
    } catch (error) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
      const message = error instanceof Error ? error.message : 'Unknown error';
      return res.redirect(
        `${frontendUrl}/auth/callback?error=${encodeURIComponent(message)}`
      );
    }
  }
}
