import { Controller, Post, Body, Get, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Request() req) {
    return this.authService.login(req.user);
  }

  @Post('register')
  async register(@Body() body: { email: string; password: string; firstName?: string; lastName?: string }) {
    return this.authService.register(body.email, body.password, body.firstName, body.lastName);
  }

  @UseGuards(JwtAuthGuard)
  @Get('user')
  async getCurrentUser(@Request() req) {
    return req.user;
  }

  @Post('logout')
  async logout() {
    // JWT is stateless, so logout is handled client-side by removing the token
    return { message: 'Logged out successfully' };
  }
}

