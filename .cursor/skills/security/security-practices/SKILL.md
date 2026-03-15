---
name: security-practices
description: Security best practices for authentication, authorization, secrets management, input validation, and data protection. Use when implementing authentication, configuring authorization, managing secrets, validating user input, protecting sensitive data, or reviewing security compliance.
---

# Security Practices

## Overview

This workspace follows security best practices including defense in depth, least privilege, input validation, and secure defaults. All services must implement proper security measures.

**Related Rules**:

- [security.mdc](.cursor/rules/core/security.mdc) - Security best practices
- [logging.mdc](.cursor/rules/core/logging.mdc) - Data redaction in logs
- [api-design.mdc](.cursor/rules/api/api-design.mdc) - API security patterns

## Security Principles

1. **Defense in Depth**: Implement multiple layers of security
2. **Least Privilege**: Grant minimum necessary permissions
3. **Never Trust User Input**: Always validate and sanitize
4. **Secure by Default**: Fail securely, deny by default
5. **Never Commit Secrets**: Use environment variables or secret management

## Secrets Management

### Using Environment Variables

**✅ CORRECT - Use environment variables:**

```typescript
import { env } from "env-var";

const config = {
  jwtSecret: env("JWT_SECRET").required().asString(),
  apiKey: env("API_KEY").required().asString(),
  databaseUrl: env("DATABASE_URL").required().asString(),
};
```

### Configuration Pattern

```typescript
// config/env.config.ts
export const envConfig = (): Partial<Config> => ({
  security: {
    jwtSecret: env("JWT_SECRET").required().asString(),
    apiKey: env("API_KEY").required().asString(),
  },
});
```

**❌ WRONG - Never hardcode secrets:**

```typescript
// NEVER DO THIS!
const apiKey = "sk_live_1234567890abcdef";
const jwtSecret = "my-secret-key";
const password = "admin123";
```

## Input Validation

### Using class-validator

**✅ CORRECT - Validate DTOs:**

```typescript
import {
  IsString,
  IsEmail,
  MinLength,
  MaxLength,
  IsOptional,
} from "class-validator";

export class CreateUserDto {
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  username: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
```

### Validation Pipe

Enable globally in `main.ts`:

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true, // Strip unknown properties
    forbidNonWhitelisted: true, // Throw error on unknown properties
    transform: true, // Transform payloads to DTO instances
  })
);
```

### Custom Validators

```typescript
import { registerDecorator, ValidationOptions } from "class-validator";

export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isStrongPassword",
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/.test(
            value
          );
        },
      },
    });
  };
}
```

## Data Redaction

### Redacting Sensitive Data in Logs

**✅ CORRECT - Redact sensitive data:**

```typescript
import { redactSensitiveData } from "@microservices-shared/logging";

this._logger.info("User login", {
  username: user.username,
  email: redactSensitiveData(user.email),
  password: "[REDACTED]",
  apiKey: "[REDACTED]",
});
```

### Sensitive Data Types

Always redact:

- Passwords
- API keys and tokens
- Credit card numbers
- Social security numbers
- Email addresses (use `redactSensitiveData()`)
- Personal identification information (PII)

## Authentication

### JWT Token Validation

```typescript
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

@Injectable()
export class AuthService {
  constructor(
    private readonly _jwtService: JwtService,
    private readonly _config: ConfigService
  ) {}

  async validateToken(token: string): Promise<User> {
    try {
      const payload = this._jwtService.verify(token, {
        secret: this._config.jwtSecret,
      });
      return await this._getUserById(payload.userId);
    } catch (error) {
      throw new UnauthorizedException("Invalid token");
    }
  }
}
```

### Authentication Guard

```typescript
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly _authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this._extractToken(request);

    if (!token) {
      throw new UnauthorizedException("Token required");
    }

    const user = await this._authService.validateToken(token);
    request.user = user;
    return true;
  }

  private _extractToken(request: Request): string | null {
    const authHeader = request.headers.authorization;
    if (!authHeader) return null;
    return authHeader.replace("Bearer ", "");
  }
}
```

## Authorization

### Role-Based Access Control

```typescript
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private readonly _requiredRole: string) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || user.role !== this._requiredRole) {
      throw new ForbiddenException("Insufficient permissions");
    }

    return true;
  }
}
```

### Usage

```typescript
@Controller("admin")
@UseGuards(AuthGuard, new RoleGuard("admin"))
export class AdminController {
  // All routes require admin role
}
```

## Input Sanitization

### Sanitizing User Input

```typescript
import { sanitize } from "sanitize-html";

function sanitizeInput(input: string): string {
  return sanitize(input, {
    allowedTags: [],
    allowedAttributes: {},
  });
}
```

### SQL Injection Prevention

Always use parameterized queries:

```typescript
// ✅ CORRECT - Parameterized query
await this._db.query("SELECT * FROM users WHERE id = ?", [userId]);

// ❌ WRONG - String concatenation (VULNERABLE TO SQL INJECTION - NEVER USE THIS PATTERN)
// This example is shown for educational purposes only - DO NOT COPY THIS CODE
await this._db.query(`SELECT * FROM users WHERE id = '${userId}'`);
```

## Best Practices

1. **Never commit secrets** - Use environment variables or secret management
2. **Validate all input** - Use DTOs with class-validator
3. **Redact sensitive data** - Never log passwords, tokens, or PII
4. **Use parameterized queries** - Prevent SQL injection
5. **Implement authentication** - Verify user identity
6. **Enforce authorization** - Check permissions
7. **Use HTTPS** - Encrypt data in transit
8. **Sanitize input** - Clean user-provided data
9. **Fail securely** - Don't expose error details to users
10. **Keep dependencies updated** - Patch security vulnerabilities

## Common Security Patterns

### Secure Configuration

```typescript
const config = {
  security: {
    jwtSecret: env("JWT_SECRET").required().asString(),
    jwtExpiration: env("JWT_EXPIRATION").default("1h").asString(),
    bcryptRounds: env("BCRYPT_ROUNDS").default(10).asIntPositive(),
  },
};
```

### Password Hashing

```typescript
import * as bcrypt from 'bcrypt';

async hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

async comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

## References

- **Security Rules**: `.cursor/rules/core/security.mdc`
- **Logging Rules**: `.cursor/rules/core/logging.mdc`
- **API Design**: `.cursor/rules/api/api-design.mdc`
- **Error Handling**: `.cursor/rules/core/general.mdc`
