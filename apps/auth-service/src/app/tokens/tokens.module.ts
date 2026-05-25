import { Module } from '@nestjs/common';
import { ApiAuthGuard, PAT_VALIDATOR } from '@evalops/shared-auth';
import { PersonalAccessTokensRepository } from '@evalops/shared-db';
import { TokensController } from './tokens.controller';

/**
 * Registers the token CRUD endpoints and wires up ApiAuthGuard with
 * PersonalAccessTokensRepository so PAT validation works within the auth-service.
 *
 * PersonalAccessTokensRepository is available via SharedDbModule @Global().
 */
@Module({
  controllers: [TokensController],
  providers: [
    ApiAuthGuard,
    {
      provide: PAT_VALIDATOR,
      useExisting: PersonalAccessTokensRepository,
    },
  ],
  exports: [ApiAuthGuard, PAT_VALIDATOR],
})
export class TokensModule {}
