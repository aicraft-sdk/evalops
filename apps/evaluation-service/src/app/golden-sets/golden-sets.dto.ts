import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsObject,
  IsNumber,
  Min,
  Max,
} from 'class-validator';

export class CreateGoldenSetDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class AddGoldenSetExampleDto {
  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>;

  @IsNotEmpty()
  output!: unknown;

  @IsOptional()
  expected?: unknown;

  @IsOptional()
  context?: string[];

  @IsBoolean()
  humanLabel!: boolean;

  @IsOptional()
  @IsString()
  humanReasoning?: string;

  @IsOptional()
  @IsBoolean()
  isBadExample?: boolean;
}

export class RunCalibrationDto {
  @IsString()
  @IsNotEmpty()
  judgeEvaluator!: string;

  @IsOptional()
  @IsObject()
  judgeConfig?: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  judgeThreshold?: number;
}
