import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { join } from "path";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix("api", { exclude: ["health"] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: true,
    }),
  );
  app.useStaticAssets(join(process.cwd(), "public"));
  app.enableCors();

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Upfall API")
    .setDescription(
      "문서 기반 RAG AI Agent API 문서입니다. 각 엔드포인트의 요청/응답 예시와 오류 응답 스키마를 포함합니다.",
    )
    .setVersion("1.0.0")
    .addTag("chat", "문서 기반 질의응답 및 세션 히스토리")
    .addTag("rag", "문서 ingest 및 인덱싱")
    .addTag("llm", "모델 라우팅 및 지원 모델 조회")
    .addTag("health", "서비스 헬스체크")
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig, {
    deepScanRoutes: true,
  });

  SwaggerModule.setup("api/docs", app, swaggerDocument, {
    customSiteTitle: "Upfall API Docs",
    swaggerOptions: {
      docExpansion: "none",
      filter: true,
      displayRequestDuration: true,
      operationsSorter: "alpha",
      tagsSorter: "alpha",
    },
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
