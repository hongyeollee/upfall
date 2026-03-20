import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiBadRequestResponse,
  ApiBody,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { ChatDto } from './dto/chat.dto';
import { ChatHistoryResponseDto } from './dto/chat-history-response.dto';
import { ChatResponseDto } from './dto/chat-response.dto';
import { ChatService } from './chat.service';

@ApiExtraModels(ErrorResponseDto)
@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @ApiOperation({
    summary: '문서 기반 질의응답 실행',
    description:
      '질문을 받아 RAG 검색 후 답변을 생성합니다. 요청별 model 오버라이드를 지원하며 응답에 references를 포함합니다.',
  })
  @ApiBody({ type: ChatDto })
  @ApiOkResponse({
    description: '질문 처리 성공',
    type: ChatResponseDto,
  })
  @ApiBadRequestResponse({
    description: '입력값 검증 실패',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ErrorResponseDto) },
        example: {
          statusCode: 400,
          code: 'BAD_REQUEST',
          message: 'question must be a string',
          path: '/api/chat',
          requestId: '8f3f6df9-9f50-40e7-aa69-09f8ba4f80de',
          timestamp: '2026-03-20T09:00:00.000Z',
          details: {
            validationErrors: ['question must be a string'],
          },
        },
      },
    },
  })
  @ApiInternalServerErrorResponse({
    description: '채팅 처리 중 서버 내부 오류',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ErrorResponseDto) },
        example: {
          statusCode: 500,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
          path: '/api/chat',
          requestId: '4aebfc77-6fdb-4f26-bf21-a32da7c08df2',
          timestamp: '2026-03-20T09:00:00.000Z',
        },
      },
    },
  })
  @Post()
  async chat(
    @Body() body: ChatDto,
  ): Promise<ChatResponseDto> {
    return this.chatService.chat(body);
  }

  @ApiOperation({
    summary: '세션 히스토리 조회',
    description: '세션 ID 기준으로 누적된 user/assistant 메시지를 조회합니다.',
  })
  @ApiParam({
    name: 'id',
    description: '조회할 세션 ID',
    example: 'user-001',
  })
  @ApiOkResponse({
    description: '히스토리 조회 성공',
    type: ChatHistoryResponseDto,
  })
  @ApiNotFoundResponse({
    description: '세션 히스토리를 찾을 수 없음',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ErrorResponseDto) },
        example: {
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'Session not found',
          path: '/api/chat/history/user-001',
          requestId: '55d9bde5-55b9-4549-a9f0-76795d27d9be',
          timestamp: '2026-03-20T09:00:00.000Z',
        },
      },
    },
  })
  @ApiInternalServerErrorResponse({
    description: '히스토리 조회 중 서버 내부 오류',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ErrorResponseDto) },
        example: {
          statusCode: 500,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
          path: '/api/chat/history/user-001',
          requestId: '70e2ecbe-7dad-4ea6-b43b-248b7adca8a5',
          timestamp: '2026-03-20T09:00:00.000Z',
        },
      },
    },
  })
  @Get('history/:id')
  history(@Param('id') id: string): ChatHistoryResponseDto {
    return this.chatService.getHistory(id);
  }
}
