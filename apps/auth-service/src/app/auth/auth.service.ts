import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DatabaseStorageService } from '../storage/database-storage.service';
import { JwtPayload } from '@evalops/shared-auth';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private storageService: DatabaseStorageService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async validateUser(email: string, password: string): Promise<any> {
    // Development mode: allow demo login (fallback for testing)
    if (process.env.NODE_ENV === 'development') {
      if (email === 'dev@example.com' && password === 'dev') {
        let user = await this.storageService.getUser('dev-user-123');
        if (!user) {
          // Create demo user with hashed password
          const passwordHash = await bcrypt.hash('dev', 10);
          user = await this.storageService.upsertUser({
            id: 'dev-user-123',
            email: 'dev@example.com',
            passwordHash,
            firstName: 'Demo',
            lastName: 'User',
            organizationId: 'default-org',
            role: 'admin',
            profileImageUrl: null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);
        }
        return user;
      }
    }

    // Look up user by email
    const user = await this.storageService.getUserByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user has a password (Microsoft SSO users won't have one)
    if (!user.passwordHash) {
      throw new UnauthorizedException('Password authentication not available for this user. Please use Microsoft SSO.');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login time
    await this.storageService.upsertUser({
      ...user,
      lastLoginAt: new Date(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    return user;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async login(user: any) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      roles: user.role ? [user.role] : [],
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

  async register(
    email: string,
    password: string,
    firstName?: string,
    lastName?: string,
  ) {
    // Check if user already exists
    const existingUser = await this.storageService.getUserByEmail(email);
    if (existingUser) {
      throw new BadRequestException('User with this email already exists');
    }

    // Hash password with bcrypt (10 salt rounds)
    const passwordHash = await bcrypt.hash(password, 10);

    // Create or get default organization
    let organization = await this.storageService.getOrganization('default-org');
    if (!organization) {
      organization = await this.storageService.createOrganization({
        id: 'default-org',
        name: 'Default Organization',
        createdAt: new Date(),
      });
    }

    // Create user with hashed password
    const user = await this.storageService.upsertUser({
      email,
      passwordHash,
      firstName: firstName || '',
      lastName: lastName || '',
      organizationId: organization.id,
      role: 'viewer', // Default role
      profileImageUrl: null,
      isActive: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    // Generate JWT token for immediate login
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      roles: user.role ? [user.role] : [],
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

  async validateJwtPayload(payload: JwtPayload) {
    const user = await this.storageService.getUser(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async findUserByEmail(email: string): Promise<any> {
    return await this.storageService.getUserByEmail(email);
  }

  async createUserFromMicrosoft(entraUser: {
    oid: string;
    upn: string;
    name: string;
    given_name?: string;
    family_name?: string;
    email?: string;
    preferred_username?: string;
    tid: string;
    roles?: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }): Promise<any> {
    // Create or get default organization
    let organization = await this.storageService.getOrganization('default-org');
    if (!organization) {
      organization = await this.storageService.createOrganization({
        id: 'default-org',
        name: 'Default Organization',
        createdAt: new Date(),
      });
    }

    // Create user from Microsoft account
    const user = await this.storageService.upsertUser({
      id: `ms-${entraUser.oid}`,
      email: entraUser.email || entraUser.upn,
      firstName: entraUser.given_name || entraUser.name.split(' ')[0] || '',
      lastName: entraUser.family_name || entraUser.name.split(' ').slice(1).join(' ') || '',
      organizationId: organization.id,
      role: entraUser.roles?.includes('admin') ? 'admin' : 'viewer',
      profileImageUrl: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    return user;
  }

  async updateUserFromMicrosoft(
    userId: string,
    entraUser: {
      oid: string;
      upn: string;
      name: string;
      given_name?: string;
      family_name?: string;
      email?: string;
      preferred_username?: string;
      tid: string;
      roles?: string[];
    },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    // Get existing user first
    const existingUser = await this.storageService.getUser(userId);

    // Update existing user with Microsoft account info
    const user = await this.storageService.upsertUser({
      id: userId,
      email: entraUser.email || entraUser.upn,
      firstName: entraUser.given_name || existingUser?.firstName || '',
      lastName: entraUser.family_name || existingUser?.lastName || '',
      organizationId: existingUser?.organizationId || 'default-org',
      role: entraUser.roles?.includes('admin') ? 'admin' : existingUser?.role || 'viewer',
      profileImageUrl: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    return user;
  }
}

