import { IsNotEmpty, IsString } from 'class-validator';

export class BuildPrDecorationDto {
  @IsString() @IsNotEmpty() runId!: string;
}
