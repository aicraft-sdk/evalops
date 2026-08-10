/**
 * Proves `UpdateOrganizationDto` closes the same client-supplied
 * id/createdAt/updatedAt injection class already fixed for
 * `CreateOrganizationDto` (see organizations.dto.ts), but for the admin
 * organization-update route.
 *
 * Exercised directly against `class-validator`'s `validate()` with
 * `whitelist: true` — the exact option NestJS's global `ValidationPipe`
 * (`whitelist: true, transform: true`, see main.ts) uses under the hood.
 * `POST /admin/organizations/:id` currently 403s every request (including
 * legitimate admins) due to a separate, pre-existing, out-of-scope
 * role/roles RBAC mismatch bug, so this test proves the DTO/validation
 * behavior directly rather than via a full HTTP round trip.
 */
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateOrganizationDto } from './organization-update.dto';

describe('UpdateOrganizationDto', () => {
  it('strips a spoofed id/createdAt/updatedAt from the update payload while keeping the legitimate name change', async () => {
    const attackerPayload = {
      name: 'New Name',
      id: 'attacker-controlled-id',
      createdAt: '1999-01-01T00:00:00.000Z',
      updatedAt: '1999-01-01T00:00:00.000Z',
    };

    const dto = plainToInstance(UpdateOrganizationDto, attackerPayload);
    const errors = await validate(dto, { whitelist: true });

    expect(errors).toHaveLength(0);
    expect(dto.name).toBe('New Name');
    expect((dto as unknown as Record<string, unknown>)['id']).toBeUndefined();
    expect(
      (dto as unknown as Record<string, unknown>)['createdAt'],
    ).toBeUndefined();
    expect(
      (dto as unknown as Record<string, unknown>)['updatedAt'],
    ).toBeUndefined();
  });

  it('rejects an empty string name', async () => {
    const dto = plainToInstance(UpdateOrganizationDto, { name: '' });
    const errors = await validate(dto, { whitelist: true });

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('name');
  });
});
