import { Body, Controller, Get, HttpException, HttpStatus, Param, Post } from '@nestjs/common';
import { ChatDto } from './dto/chat.dto';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  async chat(
    @Body() body: ChatDto,
  ): Promise<{ answer: string; sessionId: string; modelUsed: string; references: string[] }> {
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

  @Get('history/:id')
  history(@Param('id') id: string): { sessionId: string; messages: Array<{ role: string; content: string; createdAt: string }> } {
    return this.chatService.getHistory(id);
  }
}
