import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiBadRequestResponse,
  ApiBody,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import * as path from 'node:path';
import { IngestDto } from './dto/ingest.dto';
import { IngestResponseDto } from './dto/ingest-response.dto';
import { IngestService } from './ingest.service';

@ApiExtraModels(ErrorResponseDto)
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
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ErrorResponseDto) },
        example: {
          statusCode: 400,
          code: 'BAD_REQUEST',
          message: 'filePath must be a string',
          path: '/api/rag/ingest',
          requestId: 'c7658eeb-bdda-4e72-a4e5-83467e3b048a',
          timestamp: '2026-03-20T09:00:00.000Z',
          details: {
            validationErrors: ['filePath must be a string'],
          },
        },
      },
    },
  })
  @ApiInternalServerErrorResponse({
    description: '문서 인덱싱 중 서버 내부 오류',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ErrorResponseDto) },
        example: {
          statusCode: 500,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
          path: '/api/rag/ingest',
          requestId: '4be136de-4da5-494e-a809-e9aa33cb86ac',
          timestamp: '2026-03-20T09:00:00.000Z',
        },
      },
    },
  })
  @Post('ingest')
  async ingest(
    @Body() body: IngestDto,
  ): Promise<IngestResponseDto> {
    const filePath = body.filePath ?? path.join('documents', 'ai-agent-market.pdf');
    const result = await this.ingestService.ingest(filePath);
    return { success: true, ...result };
  }
}
