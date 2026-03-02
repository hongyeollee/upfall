import { Controller, Get } from '@nestjs/common';
import { LlmRouterService } from './llm-router.service';

@Controller('llm')
export class LlmController {
  constructor(private readonly llmRouterService: LlmRouterService) {}

  @Get('models')
  getModels(): { defaultModel: string; supportedModels: string[] } {
    return {
      defaultModel: process.env.LLM_MODEL ?? 'gpt-5.2',
      supportedModels: this.llmRouterService.getSupportedModels(),
    };
  }
}
