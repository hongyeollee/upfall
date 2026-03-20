import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthResponseDto } from './dto/health-response.dto';
import { VectorstoreService } from './rag/vectorstore.service';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly vectorstoreService: VectorstoreService) {}

  @ApiOperation({
    summary: '서비스 헬스 체크',
    description: '애플리케이션 상태와 Chroma 연결 및 벡터스토어 동작 모드를 반환합니다.',
  })
  @ApiOkResponse({
    description: '헬스 체크 성공',
    type: HealthResponseDto,
  })
  @Get('health')
  async health(): Promise<HealthResponseDto> {
    let storeInitError: string | undefined;

    try {
      await this.vectorstoreService.ensureStoreReady();
    } catch (error) {
      storeInitError = error instanceof Error ? error.message : 'store init failed';
    }

    const chromaOk = await this.vectorstoreService.pingChroma();
    const usingMemory = this.vectorstoreService.isUsingMemoryFallback();

    return {
      status: !storeInitError && (chromaOk || usingMemory) ? 'ok' : 'degraded',
      chroma: chromaOk ? 'up' : 'down',
      vectorStore: usingMemory ? 'memory' : 'chroma',
      modelDefault: process.env.LLM_MODEL ?? 'gpt-5.2',
      ...(storeInitError ? { detail: storeInitError } : {}),
    };
  }
}
