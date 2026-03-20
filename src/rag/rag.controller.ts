import { Body, Controller, HttpException, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import * as path from 'node:path';
import { IngestDto } from './dto/ingest.dto';
import { IngestResponseDto } from './dto/ingest-response.dto';
import { IngestService } from './ingest.service';

@ApiTags('rag')
@Controller('rag')
export class RagController {
  constructor(private readonly ingestService: IngestService) {}

  @ApiOperation({
    summary: '문서 인덱싱(ingest) 실행',
    description:
      'PDF 문서를 파싱하고 chunk + embedding을 생성하여 벡터스토어에 적재합니다. filePath 생략 시 기본 문서를 사용합니다.',
  })
  @ApiBody({ type: IngestDto })
  @ApiOkResponse({
    description: '인덱싱 성공',
    type: IngestResponseDto,
  })
  @ApiBadRequestResponse({
    description: '파일 경로 오류, 파싱 실패, 임베딩 실패 등 인덱싱 오류',
    schema: {
      example: {
        message: '문서 수집(ingest)에 실패했습니다.',
        detail: 'ENOENT: no such file or directory, open ...',
      },
    },
  })
  @Post('ingest')
  async ingest(
    @Body() body: IngestDto,
  ): Promise<IngestResponseDto> {
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
