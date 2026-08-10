import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Request body for `POST /admin/organizations/:id`.
 *
 * Deliberately a class-validator-decorated class, NOT the Zod-inferred
 * `InsertOrganization` type — the same fix already applied to
 * `CreateOrganizationDto` (see `../organizations/organizations.dto.ts`) for
 * the identical reason: NestJS's global `ValidationPipe`
 * (`whitelist: true, transform: true`, see main.ts) only validates AND
 * strips unknown properties when the `@Body()` param's runtime metatype is
 * an actual class — a plain TS type/interface (which `InsertOrganization`
 * is, despite looking type-safe at compile time) resolves to `Object` at
 * runtime and the pipe silently no-ops. Using this class here closes that
 * gap: any client-supplied `id`/`createdAt`/`updatedAt` (fields not
 * declared below) is stripped from the body before it ever reaches the
 * service/repository layer. `name` is the only legitimately mutable
 * organization field (see `organizations` table schema).
 */
export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;
}
