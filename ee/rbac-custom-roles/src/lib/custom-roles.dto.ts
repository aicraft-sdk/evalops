import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const RESOURCE_TYPES = [
  'organization',
  'dataset',
  'prompt',
  'flow',
  'eval_spec',
  'run',
  'model',
  'provider',
  'policy',
  'baseline',
];
const PERMISSION_ACTIONS = ['read', 'write', 'delete', 'execute', 'manage', 'admin'];

export class RolePermissionInputDto {
  @IsString() @IsIn(RESOURCE_TYPES) resourceType!: string;
  @IsString() @IsIn(PERMISSION_ACTIONS) action!: string;
}

export class CreateCustomRoleDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(0) @Max(99) priority?: number; // 100 is reserved for the built-in Administrator role
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RolePermissionInputDto)
  permissions!: RolePermissionInputDto[];
}

export class UpdateCustomRoleDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RolePermissionInputDto)
  permissions?: RolePermissionInputDto[];
}
