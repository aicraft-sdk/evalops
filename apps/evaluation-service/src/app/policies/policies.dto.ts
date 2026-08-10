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
  ValidationArguments,
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
 * Cross-field check: threshold's shape (scalar vs [min, max] tuple) must
 * match what checkThreshold() in policies.service.ts actually does with it
 * for the given operator, otherwise the rule silently mishandles it at
 * evaluation time (always/never fires, or is permanently inert) with no
 * error anywhere in that path.
 *
 * - 'equals' / 'not_equals' compare `value !== threshold` directly — a
 *   tuple threshold there is always/never a match, never the intended
 *   per-value comparison.
 * - 'between' requires a [number, number] tuple — a scalar threshold there
 *   fails the `Array.isArray` guard and isViolation silently stays false.
 */
function isThresholdShapeValidForOperator(
  threshold: unknown,
  operator: unknown
): boolean {
  if (threshold === undefined || operator === undefined) return true;

  const isTuple = Array.isArray(threshold);

  if (operator === 'equals' || operator === 'not_equals') {
    return !isTuple;
  }

  if (operator === 'between') {
    return isTuple;
  }

  return true;
}

export function IsThresholdShapeValidForOperator(
  validationOptions?: ValidationOptions
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isThresholdShapeValidForOperator',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(threshold: unknown, args: ValidationArguments) {
          const operator = (args.object as { operator?: unknown }).operator;
          return isThresholdShapeValidForOperator(threshold, operator);
        },
        defaultMessage(args: ValidationArguments) {
          const operator = (args.object as { operator?: unknown }).operator;
          if (operator === 'between') {
            return `${propertyName} must be a [number, number] tuple when operator is 'between'`;
          }
          return `${propertyName} must not be a [number, number] tuple when operator is 'equals' or 'not_equals'`;
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
  @IsThresholdShapeValidForOperator()
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
