import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({
    description: 'HTTP status code',
    example: 400,
  })
  statusCode!: number;

  @ApiProperty({
    description: '표준화된 에러 코드',
    example: 'BAD_REQUEST',
  })
  code!: string;

  @ApiProperty({
    description: '클라이언트에 노출되는 에러 메시지',
    example: 'Invalid request payload',
  })
  message!: string;

  @ApiProperty({
    description: '요청 경로',
    example: '/api/chat',
  })
  path!: string;

  @ApiProperty({
    description: '서버 에러 추적용 요청 식별자',
    example: '8f3f6df9-9f50-40e7-aa69-09f8ba4f80de',
  })
  requestId!: string;

  @ApiProperty({
    description: '에러 발생 시각 (ISO 8601)',
    example: '2026-03-20T09:00:00.000Z',
  })
  timestamp!: string;

  @ApiPropertyOptional({
    description: '검증 실패 상세 정보 또는 디버깅 정보',
    type: 'object',
    additionalProperties: true,
  })
  details?: Record<string, unknown>;
}
