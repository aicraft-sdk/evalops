import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { JwtAuthGuard, PAT_TOKEN_PREFIX } from '@evalops/shared-auth';
import { PersonalAccessTokensRepository } from '@evalops/shared-db';
import { CreateTokenDto } from './dto/create-token.dto';

interface AuthenticatedRequest {
  user: { id: string; organizationId: string };
}

@Controller('auth/tokens')
@UseGuards(JwtAuthGuard)
export class TokensController {
  constructor(
    private readonly tokensRepo: PersonalAccessTokensRepository,
  ) {}

  @Post()
  async create(
    @Body() dto: CreateTokenDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const raw = PAT_TOKEN_PREFIX + randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(raw).digest('hex');
    const ttlDays = dto.ttlDays ?? 90;
    const expiresAt = new Date(Date.now() + ttlDays * 86_400_000);
    const id = randomBytes(16).toString('hex');

    const token = await this.tokensRepo.create({
      id,
      organizationId: req.user.organizationId,
      userId: req.user.id,
      name: dto.name,
      tokenHash: hash,
      scopes: dto.scopes ?? [],
      expiresAt,
    });

    // Strip tokenHash from response; include raw token (shown once)
    const { tokenHash: _hash, ...rest } = token;
    return { ...rest, token: raw };
  }

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.tokensRepo.findAll(req.user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const revoked = await this.tokensRepo.revoke(id, req.user.id);
    if (!revoked) {
      throw new NotFoundException('Token not found');
    }
  }
}
