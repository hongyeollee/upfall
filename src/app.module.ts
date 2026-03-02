import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { ChatModule } from "./chat/chat.module";
import { LlmModule } from "./llm/llm.module";
import { RagModule } from "./rag/rag.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", ".env.docker"],
    }),
    LlmModule,
    RagModule,
    ChatModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
