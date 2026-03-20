import { ApiProperty } from '@nestjs/swagger';

export class ChatResponseDto {
  @ApiProperty({
    description: '모델이 생성한 최종 답변',
    example: '2024년 기준 51억 달러이며 2030년까지 471억 달러로 성장할 것으로 예측됩니다.',
  })
  answer!: string;

  @ApiProperty({
    description: '요청에 사용된 세션 ID',
    example: 'user-001',
  })
  sessionId!: string;

  @ApiProperty({
    description: '실제 응답 생성에 사용된 모델명 또는 fallback 식별자',
    example: 'gpt-5.2',
  })
  modelUsed!: string;

  @ApiProperty({
    description: '답변 근거로 사용한 문서 레퍼런스 목록',
    example: ['/app/documents/ai-agent-market.pdf#12'],
    type: [String],
  })
  references!: string[];
}
