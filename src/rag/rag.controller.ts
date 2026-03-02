import { Body, Controller, HttpException, HttpStatus, Post } from '@nestjs/common';
import * as path from 'node:path';
import { IngestDto } from './dto/ingest.dto';
import { IngestService } from './ingest.service';

@Controller('rag')
export class RagController {
  constructor(private readonly ingestService: IngestService) {}

  @Post('ingest')
  async ingest(
    @Body() body: IngestDto,
  ): Promise<{ success: boolean; chunks: number; filePath: string }> {
    const filePath = body.filePath ?? path.join('documents', 'ai-agent-market.pdf');

    try {
      const result = await this.ingestService.ingest(filePath);
      return { success: true, ...result };
    } catch (error) {
      throw new HttpException(
        {
          message: '문서 수집(ingest)에 실패했습니다.',
          detail: error instanceof Error ? error.message : 'unknown error',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
