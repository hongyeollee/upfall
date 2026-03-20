import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class IngestDto {
  @ApiPropertyOptional({
    description: '수집할 문서 경로. 생략 시 기본값 documents/ai-agent-market.pdf를 사용합니다.',
    example: 'documents/ai-agent-market.pdf',
  })
  @IsOptional()
  @IsString()
  filePath?: string;
}
