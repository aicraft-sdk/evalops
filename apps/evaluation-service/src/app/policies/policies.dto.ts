import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsArray,
  ArrayMinSize,
  ValidateNested,
  IsIn,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * threshold on a PolicyRule (see policies.service.ts) is a union type:
 * number | [number, number]. class-validator has no built-in union
 * validator, so this is a small custom constraint.
 */
function isThresholdValue(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value === 'number') return true;
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((v) => typeof v === 'number')
  );
}

export function IsThresholdValue(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isThresholdValue',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return isThresholdValue(value);
        },
        defaultMessage() {
          return `${propertyName} must be a number or a [number, number] tuple`;
        },
      },
    });
  };
}

/**
 * Mirrors PoliciesService's PolicyRule interface exactly — this is the shape
 * consumed by evaluateRun()/evaluatePolicies(), not a new invented shape.
 */
export class PolicyRuleDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsString()
  @IsNotEmpty()
  metric!: string;

  @IsOptional()
  @IsIn(['greater_than', 'less_than', 'equals', 'not_equals', 'between'])
  operator?: 'greater_than' | 'less_than' | 'equals' | 'not_equals' | 'between';

  @IsOptional()
  @IsThresholdValue()
  threshold?: number | [number, number];

  @IsIn(['warn', 'fail', 'error'])
  severity!: 'warn' | 'fail' | 'error';

  @IsString()
  description!: string;

  @IsBoolean()
  enabled!: boolean;
}

export class CreatePolicyDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PolicyRuleDto)
  rules!: PolicyRuleDto[];
}

export class UpdatePolicyDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PolicyRuleDto)
  rules?: PolicyRuleDto[];
}
