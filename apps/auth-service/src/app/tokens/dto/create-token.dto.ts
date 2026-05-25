import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateTokenDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  @Transform(({ value }: { value: unknown }) =>
    value !== undefined ? Number(value) : undefined,
  )
  ttlDays?: number;
}
