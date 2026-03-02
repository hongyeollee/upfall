import { Global, Module } from '@nestjs/common';
import { LlmController } from './llm.controller';
import { LlmRouterService } from './llm-router.service';

@Global()
@Module({
  providers: [LlmRouterService],
  exports: [LlmRouterService],
  controllers: [LlmController],
})
export class LlmModule {}
