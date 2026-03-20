import { ApiProperty } from '@nestjs/swagger';

export class IngestResponseDto {
  @ApiProperty({
    description: '요청 성공 여부',
    example: true,
  })
  success!: boolean;

  @ApiProperty({
    description: '저장된 문서 청크 개수',
    example: 42,
  })
  chunks!: number;

  @ApiProperty({
    description: '실제 처리된 절대 경로',
    example: '/app/documents/ai-agent-market.pdf',
  })
  filePath!: string;
}
