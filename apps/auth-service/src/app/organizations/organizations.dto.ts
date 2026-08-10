import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Request body for `POST /organizations`.
 *
 * Deliberately a class-validator-decorated class, NOT the Zod-inferred
 * `InsertOrganization` type. NestJS's global `ValidationPipe`
 * (`whitelist: true, transform: true`, see main.ts) only validates AND
 * strips unknown properties when the `@Body()` param's runtime metatype is
 * an actual class — a plain TS type/interface (which `InsertOrganization`
 * is, despite looking type-safe at compile time) resolves to `Object` at
 * runtime and the pipe silently no-ops. Using this class here closes that
 * gap: any client-supplied `id`/`createdAt`/`updatedAt` (fields not
 * declared below) is stripped from the body before it ever reaches the
 * service/repository layer.
 */
export class CreateOrganizationDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}
