import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import {
  DocumentBuilder,
  SwaggerDocumentOptions,
  SwaggerModule,
  getSchemaPath,
} from "@nestjs/swagger";
import { join } from "path";
import { AppModule } from "./app.module";
import { HTTP_ERROR_CODE_MAP } from "./common/constants/http-error-code-map";
import { ErrorResponseDto } from "./common/dto/error-response.dto";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";

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
  app.useGlobalFilters(new HttpExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Upfall API")
    .setDescription(
      "문서 기반 RAG AI Agent API 문서입니다. 각 엔드포인트의 요청/응답 예시와 오류 응답 스키마를 포함합니다.",
    )
    .setVersion("1.0.0")
    .setContact("Platform Team", "", "platform@example.com")
    .setLicense("Proprietary", "")
    .addServer("http://localhost", "Docker + Nginx (권장)")
    .addServer("http://localhost:3000", "로컬 단독 실행")
    .addTag("chat", "문서 기반 질의응답 및 세션 히스토리")
    .addTag("rag", "문서 ingest 및 인덱싱")
    .addTag("llm", "모델 라우팅 및 지원 모델 조회")
    .addTag("health", "서비스 헬스체크")
    .build();

  const documentOptions: SwaggerDocumentOptions = {
    deepScanRoutes: true,
    extraModels: [ErrorResponseDto],
  };
  const swaggerDocument = SwaggerModule.createDocument(
    app,
    swaggerConfig,
    documentOptions,
  );

  swaggerDocument.components = swaggerDocument.components ?? {};
  swaggerDocument.components.responses = {
    ...(swaggerDocument.components.responses ?? {}),
    BadRequestError: {
      description: "요청 데이터 검증 실패 또는 잘못된 파라미터",
      content: {
        "application/json": {
          schema: { $ref: getSchemaPath(ErrorResponseDto) },
          example: {
            statusCode: 400,
            code: HTTP_ERROR_CODE_MAP[400],
            message: "question must be a string",
            path: "/api/chat",
            requestId: "8f3f6df9-9f50-40e7-aa69-09f8ba4f80de",
            timestamp: "2026-03-20T09:00:00.000Z",
            details: {
              validationErrors: ["question must be a string"],
            },
          },
        },
      },
    },
    NotFoundError: {
      description: "요청한 리소스를 찾을 수 없음",
      content: {
        "application/json": {
          schema: { $ref: getSchemaPath(ErrorResponseDto) },
          example: {
            statusCode: 404,
            code: HTTP_ERROR_CODE_MAP[404],
            message: "Cannot GET /api/unknown",
            path: "/api/unknown",
            requestId: "55d9bde5-55b9-4549-a9f0-76795d27d9be",
            timestamp: "2026-03-20T09:00:00.000Z",
          },
        },
      },
    },
    InternalServerError: {
      description: "서버 내부 오류",
      content: {
        "application/json": {
          schema: { $ref: getSchemaPath(ErrorResponseDto) },
          example: {
            statusCode: 500,
            code: HTTP_ERROR_CODE_MAP[500],
            message: "Internal server error",
            path: "/api/chat",
            requestId: "4aebfc77-6fdb-4f26-bf21-a32da7c08df2",
            timestamp: "2026-03-20T09:00:00.000Z",
          },
        },
      },
    },
    PayloadTooLargeError: {
      description: "요청 본문 크기 초과 (Nginx 레이어)",
      content: {
        "application/json": {
          schema: { $ref: getSchemaPath(ErrorResponseDto) },
          example: {
            statusCode: 413,
            code: HTTP_ERROR_CODE_MAP[413],
            message: "Request entity too large",
            path: "/api/rag/ingest",
            requestId: "daef0dd1-b93e-47d0-91be-3afce50f6f03",
            timestamp: "2026-03-20T09:00:00.000Z",
          },
        },
      },
    },
    BadGatewayError: {
      description: "업스트림 서버 오류 (Nginx 레이어)",
      content: {
        "application/json": {
          schema: { $ref: getSchemaPath(ErrorResponseDto) },
          example: {
            statusCode: 502,
            code: HTTP_ERROR_CODE_MAP[502],
            message: "Bad gateway",
            path: "/api/chat",
            requestId: "fdb8e9c4-6b42-49f3-9f0e-8f8194d0e032",
            timestamp: "2026-03-20T09:00:00.000Z",
          },
        },
      },
    },
    GatewayTimeoutError: {
      description: "업스트림 응답 지연 (Nginx 레이어)",
      content: {
        "application/json": {
          schema: { $ref: getSchemaPath(ErrorResponseDto) },
          example: {
            statusCode: 504,
            code: HTTP_ERROR_CODE_MAP[504],
            message: "Gateway timeout",
            path: "/api/chat",
            requestId: "1f126f87-7691-453e-88fb-34cb3558f918",
            timestamp: "2026-03-20T09:00:00.000Z",
          },
        },
      },
    },
  };

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
