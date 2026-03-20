import { ApiProperty } from '@nestjs/swagger';

export class ChatHistoryMessageDto {
  @ApiProperty({
    description: '메시지 발화자 역할',
    enum: ['user', 'assistant'],
    example: 'user',
  })
  role!: string;

  @ApiProperty({
    description: '메시지 본문',
    example: 'AI Agent 시장 규모는 어떻게 되나요?',
  })
  content!: string;

  @ApiProperty({
    description: '메시지 생성 시각(ISO8601)',
    example: '2026-03-20T10:30:00.000Z',
  })
  createdAt!: string;
}

export class ChatHistoryResponseDto {
  @ApiProperty({
    description: '조회한 세션 ID',
    example: 'user-001',
  })
  sessionId!: string;

  @ApiProperty({
    description: '세션 메시지 목록(오래된 순)',
    type: [ChatHistoryMessageDto],
  })
  messages!: ChatHistoryMessageDto[];
}
