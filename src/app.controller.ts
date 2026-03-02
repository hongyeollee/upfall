import { Controller, Get } from '@nestjs/common';
import { VectorstoreService } from './rag/vectorstore.service';

@Controller()
export class AppController {
  constructor(private readonly vectorstoreService: VectorstoreService) {}

  @Get('health')
  async health(): Promise<{
    status: 'ok' | 'degraded';
    chroma: 'up' | 'down';
    vectorStore: 'chroma' | 'memory';
    modelDefault: string;
    detail?: string;
  }> {
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
