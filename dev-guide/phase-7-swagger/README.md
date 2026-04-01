# Phase 7: Swagger API 문서화

> 예상 시간: 2~3시간  
> 완료 기준: `http://localhost:3000/api/docs`에서 모든 엔드포인트 테스트 가능

---

## 7-1. main.ts에 Swagger 설정 추가

```typescript
// src/main.ts
import {
  DocumentBuilder,
  SwaggerDocumentOptions,
  SwaggerModule,
  getSchemaPath,
} from "@nestjs/swagger";
import { ErrorResponseDto } from "./common/dto/error-response.dto";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // ... (이전 설정들)

  // Swagger 문서 설정
  const swaggerConfig = new DocumentBuilder()
    .setTitle("Upfall API")
    .setDescription("문서 기반 RAG AI Agent API")
    .setVersion("1.0.0")
    .addServer("http://localhost", "Docker + Nginx (권장)")
    .addServer("http://localhost:3000", "로컬 단독 실행")
    .addTag("chat", "문서 기반 질의응답 및 세션 히스토리")
    .addTag("rag", "문서 ingest 및 인덱싱")
    .addTag("llm", "모델 라우팅 및 지원 모델 조회")
    .addTag("health", "서비스 헬스체크")
    .build();

  const documentOptions: SwaggerDocumentOptions = {
    deepScanRoutes: true,
    extraModels: [ErrorResponseDto],  // 에러 응답 스키마도 포함
  };

  const document = SwaggerModule.createDocument(app, swaggerConfig, documentOptions);

  // 공통 에러 응답 스키마 (재사용)
  document.components = document.components ?? {};
  document.components.responses = {
    BadRequestError: {
      description: "요청 데이터 검증 실패",
      content: {
        "application/json": {
          schema: { $ref: getSchemaPath(ErrorResponseDto) },
          example: {
            statusCode: 400,
            code: "BAD_REQUEST",
            message: "question must be a string",
            path: "/api/chat",
            requestId: "uuid",
            timestamp: "2026-01-01T00:00:00.000Z",
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
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error",
            path: "/api/chat",
            requestId: "uuid",
            timestamp: "2026-01-01T00:00:00.000Z",
          },
        },
      },
    },
  };

  SwaggerModule.setup("api/docs", app, document, {
    customSiteTitle: "Upfall API Docs",
    swaggerOptions: {
      docExpansion: "none",        // 기본 접힌 상태
      filter: true,                // 검색 필터 활성화
      displayRequestDuration: true, // 요청 시간 표시
    },
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}
```

---

## 7-2. DTO에 @ApiProperty 붙이기 (핵심!)

Swagger는 DTO의 `@ApiProperty()` 데코레이터를 읽어서 스키마를 생성한다.  
이게 없으면 Swagger에서 빈 스키마로 보인다.

### 요청 DTO 예시

```typescript
// src/chat/dto/chat.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class ChatDto {
  @ApiProperty({
    description: '사용자 질문',
    example: 'AI Agent 시장 규모는?',
  })
  @IsString()
  @MinLength(1)
  question: string;

  @ApiProperty({
    description: '세션 ID (멀티턴 대화 유지용)',
    example: 'session-001',
  })
  @IsString()
  sessionId: string;

  @ApiPropertyOptional({
    description: '사용할 LLM 모델 (미지정 시 기본값 사용)',
    example: 'gpt-4o-mini',
  })
  @IsOptional()
  @IsString()
  model?: string;
}
```

### 응답 DTO 예시

```typescript
// src/chat/dto/chat-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class ChatResponseDto {
  @ApiProperty({ description: 'LLM 답변', example: '2024년 기준 AI Agent 시장 규모는...' })
  answer: string;

  @ApiProperty({ description: '세션 ID', example: 'session-001' })
  sessionId: string;

  @ApiProperty({ description: '실제 사용된 모델', example: 'gpt-4o-mini' })
  modelUsed: string;

  @ApiProperty({
    description: '참조한 문서 청크 목록',
    type: [String],
    example: ['/path/to/file.pdf#3', '/path/to/file.pdf#7'],
  })
  references: string[];
}
```

---

## 7-3. Controller에 Swagger 데코레이터 붙이기

```typescript
// src/chat/chat.controller.ts
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags, ApiResponse } from '@nestjs/swagger';

@ApiTags('chat')           // Swagger UI에서 그룹화
@Controller('chat')
export class ChatController {

  @ApiOperation({
    summary: '문서 기반 질의응답',
    description: '인덱싱된 문서에서 관련 내용을 검색하여 LLM이 답변을 생성합니다.',
  })
  @ApiBody({ type: ChatDto })
  @ApiOkResponse({
    description: '질의응답 성공',
    type: ChatResponseDto,
  })
  @ApiResponse({ status: 400, description: '요청 데이터 검증 실패' })
  @Post()
  async chat(@Body() dto: ChatDto): Promise<ChatResponseDto> {
    return this.chatService.chat({ ... });
  }
}
```

---

## 7-4. Swagger 데코레이터 치트시트

| 데코레이터 | 위치 | 역할 |
|------------|------|------|
| `@ApiTags('name')` | Controller | 그룹 레이블 |
| `@ApiOperation({ summary, description })` | Method | 엔드포인트 설명 |
| `@ApiBody({ type: Dto })` | Method | 요청 바디 스키마 |
| `@ApiOkResponse({ type: Dto })` | Method | 200 응답 스키마 |
| `@ApiResponse({ status: 400, description })` | Method | 특정 상태코드 응답 |
| `@ApiParam({ name, description })` | Method | URL 파라미터 설명 |
| `@ApiProperty({ example })` | DTO 필드 | 필드 설명 + 예시 |
| `@ApiPropertyOptional({ example })` | DTO 선택 필드 | 선택 필드 표시 |

---

## 7-5. 완료 확인

```bash
npm run start:dev
# http://localhost:3000/api/docs 접속
```

Swagger UI에서:
- `chat`, `rag`, `llm`, `health` 4개 태그 확인
- 각 엔드포인트 클릭 → 요청/응답 스키마 확인
- "Try it out" 버튼으로 실제 요청 테스트

---

## 체크리스트

- [ ] `main.ts`에 `DocumentBuilder` + `SwaggerModule.setup()` 추가
- [ ] 모든 DTO에 `@ApiProperty()` 붙이기 완료
- [ ] 모든 Controller 메서드에 `@ApiOperation`, `@ApiOkResponse` 추가
- [ ] `http://localhost:3000/api/docs` 접속 및 전체 엔드포인트 확인

**→ [Phase 8](../phase-8-health/README.md)로**
