import { IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatDto {
  @ApiProperty({
    description: '사용자 질문 원문',
    example: 'AI Agent 시장 규모는 어떻게 되나요?',
  })
  @IsString()
  question!: string;

  @ApiProperty({
    description: '대화 세션 식별자. 동일 값을 사용하면 히스토리로 묶입니다.',
    example: 'user-001',
  })
  @IsString()
  sessionId!: string;

  @ApiPropertyOptional({
    description: '요청별 모델 오버라이드. 생략 시 LLM_MODEL 환경변수 또는 기본값 사용',
    enum: ['gpt-5.2', 'gpt-5.2-pro', 'gpt-5-mini', 'gpt-5.1'],
    example: 'gpt-5.2',
  })
  @IsOptional()
  @IsString()
  model?: string;
}
