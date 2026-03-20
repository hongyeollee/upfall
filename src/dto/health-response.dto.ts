import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({
    description: '서비스 상태',
    enum: ['ok', 'degraded'],
    example: 'ok',
  })
  status!: 'ok' | 'degraded';

  @ApiProperty({
    description: 'ChromaDB 연결 상태',
    enum: ['up', 'down'],
    example: 'up',
  })
  chroma!: 'up' | 'down';

  @ApiProperty({
    description: '현재 검색 저장소 동작 모드',
    enum: ['chroma', 'memory'],
    example: 'chroma',
  })
  vectorStore!: 'chroma' | 'memory';

  @ApiProperty({
    description: '기본 LLM 모델명',
    example: 'gpt-5.2',
  })
  modelDefault!: string;

  @ApiPropertyOptional({
    description: '스토어 초기화 실패 등 추가 진단 정보',
    example: 'OPENAI_API_KEY is required',
  })
  detail?: string;
}
