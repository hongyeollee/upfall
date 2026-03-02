import { IsOptional, IsString } from 'class-validator';

export class ChatDto {
  @IsString()
  question!: string;

  @IsString()
  sessionId!: string;

  @IsOptional()
  @IsString()
  model?: string;
}
