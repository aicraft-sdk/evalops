import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsObject,
  IsNumber,
  IsArray,
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
  // Loosely typed to match `output`/`expected` below: the frontend Add
  // Example form always sends this as a plain string, and the persisted
  // column is a jsonb blob with no fixed shape - see project memory.
  @IsOptional()
  input?: unknown;

  @IsNotEmpty()
  output!: unknown;

  @IsOptional()
  expected?: unknown;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
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
