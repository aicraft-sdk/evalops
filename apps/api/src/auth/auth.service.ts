import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { StorageService } from '../storage/storage.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private storageService: StorageService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    // For now, we'll support email/password login
    // In development, we can create a default user
    // In production, users should register first or use Microsoft Entra ID
    
    if (process.env.NODE_ENV === 'development') {
      // Development mode: allow demo login
      if (email === 'dev@example.com' && password === 'dev') {
        let user = await this.storageService.getUser('dev-user-123');
        if (!user) {
          user = await this.storageService.upsertUser({
            id: 'dev-user-123',
            email: 'dev@example.com',
            firstName: 'Demo',
            lastName: 'User',
            organizationId: 'default-org',
            role: 'admin',
            profileImageUrl: null,
          });
        }
        return user;
      }
    }

    // TODO: Implement proper user lookup and password verification
    // For now, throw unauthorized
    throw new UnauthorizedException('Invalid credentials');
  }

  async login(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
    };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        organizationId: user.organizationId,
        role: user.role,
      },
    };
  }

  async register(email: string, password: string, firstName?: string, lastName?: string) {
    // TODO: Implement user registration
    // Hash password, create user, etc.
    throw new Error('Registration not yet implemented');
  }

  async validateJwtPayload(payload: any) {
    const user = await this.storageService.getUser(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }
}

