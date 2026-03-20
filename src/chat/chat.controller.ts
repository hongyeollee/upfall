import { Body, Controller, Get, HttpException, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ChatDto } from './dto/chat.dto';
import { ChatHistoryResponseDto } from './dto/chat-history-response.dto';
import { ChatResponseDto } from './dto/chat-response.dto';
import { ChatService } from './chat.service';

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
    description: '입력값 검증 실패 또는 채팅 처리 오류',
    schema: {
      example: {
        message: '채팅 처리 중 오류가 발생했습니다.',
        detail: 'OPENAI_API_KEY is required',
      },
    },
  })
  @Post()
  async chat(
    @Body() body: ChatDto,
  ): Promise<ChatResponseDto> {
    try {
      return await this.chatService.chat(body);
    } catch (error) {
      throw new HttpException(
        {
          message: '채팅 처리 중 오류가 발생했습니다.',
          detail: error instanceof Error ? error.message : 'unknown error',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
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
  @Get('history/:id')
  history(@Param('id') id: string): ChatHistoryResponseDto {
    return this.chatService.getHistory(id);
  }
}
