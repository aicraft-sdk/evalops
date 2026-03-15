import { IsOptional, IsString, IsInt, Min, Max, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class GetSpansQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @IsOptional()
  @IsString()
  spanName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minDuration?: number; // milliseconds

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxDuration?: number; // milliseconds
}

export class SearchSpansQueryDto {
  @IsOptional()
  @IsString()
  runId?: string;

  @IsOptional()
  @IsString()
  traceId?: string;

  @IsOptional()
  @IsString()
  spanName?: string;

  @IsOptional()
  @IsString()
  attributes?: string; // JSON string of key-value pairs to search

  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

export interface PaginatedSpansResponse {
  spans: TraceSpan[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface SpanTreeResponse {
  spans: TraceSpan[];
  tree: SpanTreeNode[];
}

export interface SpanTreeNode {
  span: TraceSpan;
  children: SpanTreeNode[];
}

// Re-export TraceSpan type for convenience
import { TraceSpan } from '@evalops/shared-db';
export type { TraceSpan };
