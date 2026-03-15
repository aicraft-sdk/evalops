import { Controller, Post, Body, Get, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard, CurrentUser } from '@evalops/shared-auth';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { Public } from '@evalops/shared-auth';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Request() req) {
    return this.authService.login(req.user);
  }

  @Public()
  @Post('register')
  async register(
    @Body()
    body: {
      email: string;
      password: string;
      firstName?: string;
      lastName?: string;
    },
  ) {
    return this.authService.register(
      body.email,
      body.password,
      body.firstName,
      body.lastName,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('user')
  async getCurrentUser(@CurrentUser() user: any) {
    return user;
  }

  @Public()
  @Post('logout')
  async logout() {
    // JWT is stateless, so logout is handled client-side by removing the token
    return { message: 'Logged out successfully' };
  }
}

