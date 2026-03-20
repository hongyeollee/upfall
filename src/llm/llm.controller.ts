import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LlmModelsResponseDto } from './dto/llm-models-response.dto';
import { LlmRouterService } from './llm-router.service';

@ApiTags('llm')
@Controller('llm')
export class LlmController {
  constructor(private readonly llmRouterService: LlmRouterService) {}

  @ApiOperation({
    summary: '지원 모델 목록 조회',
    description: '기본 모델과 요청별 오버라이드 가능한 모델 목록을 반환합니다.',
  })
  @ApiOkResponse({
    description: '모델 목록 조회 성공',
    type: LlmModelsResponseDto,
  })
  @Get('models')
  getModels(): LlmModelsResponseDto {
    return {
      defaultModel: process.env.LLM_MODEL ?? 'gpt-5.2',
      supportedModels: this.llmRouterService.getSupportedModels(),
    };
  }
}
