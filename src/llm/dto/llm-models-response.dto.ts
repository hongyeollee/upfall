import { ApiProperty } from '@nestjs/swagger';

export class LlmModelsResponseDto {
  @ApiProperty({
    description: '환경변수 또는 기본 정책 기반 기본 모델',
    example: 'gpt-5.2',
  })
  defaultModel!: string;

  @ApiProperty({
    description: '현재 라우터에서 허용하는 모델 목록',
    type: [String],
    example: ['gpt-5.2', 'gpt-5.2-pro', 'gpt-5-mini', 'gpt-5.1'],
  })
  supportedModels!: string[];
}
