import { IsArray, IsOptional, IsString, IsObject } from 'class-validator';
import { TraceEvent } from '@evalops/sdk';

export class BatchEventsDto {
  @IsArray()
  events!: TraceEvent[];

  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}

export class CompleteRunDto {
  @IsObject()
  artifactHashes!: Record<string, string>;
}
