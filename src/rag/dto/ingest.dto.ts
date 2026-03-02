import { IsOptional, IsString } from 'class-validator';

export class IngestDto {
  @IsOptional()
  @IsString()
  filePath?: string;
}
