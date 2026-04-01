# Phase 6: 에러 처리 표준화

> 예상 시간: 2~3시간  
> 완료 기준: 모든 에러 응답이 동일한 JSON 형식으로 반환

**왜 Phase 5 이후인가:** 에러 형식은 비즈니스 로직이 완성된 다음에 붙이는 게 맞다.  
초반에 에러 처리에 시간 쓰면 핵심 기능 개발이 늦어진다.

---

## 목표: 에러 응답 형식 통일

**Before (NestJS 기본 에러):**
```json
{
  "statusCode": 400,
  "message": ["question must be a string"],
  "error": "Bad Request"
}
```

**After (표준화된 에러):**
```json
{
  "statusCode": 400,
  "code": "BAD_REQUEST",
  "message": "question must be a string",
  "path": "/api/chat",
  "requestId": "8f3f6df9-9f50-40e7-aa69-09f8ba4f80de",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "details": {
    "validationErrors": ["question must be a string"]
  }
}
```

`requestId`가 있으면 로그에서 특정 요청을 추적할 수 있다.

---

## 6-1. HTTP 에러 코드 맵

`src/common/constants/http-error-code-map.ts`

```typescript
export const HTTP_ERROR_CODE_MAP: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_SERVER_ERROR',
  502: 'BAD_GATEWAY',
  503: 'SERVICE_UNAVAILABLE',
  504: 'GATEWAY_TIMEOUT',
};
```

---

## 6-2. 에러 응답 DTO

`src/common/dto/error-response.dto.ts`

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: 'BAD_REQUEST' })
  code: string;

  @ApiProperty({ example: 'question must be a string' })
  message: string;

  @ApiProperty({ example: '/api/chat' })
  path: string;

  @ApiProperty({ example: '8f3f6df9-9f50-40e7-aa69-09f8ba4f80de' })
  requestId: string;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  timestamp: string;

  @ApiPropertyOptional({
    example: { validationErrors: ['question must be a string'] }
  })
  details?: Record<string, unknown>;
}
```

---

## 6-3. HttpExceptionFilter 구현

`src/common/filters/http-exception.filter.ts`

```typescript
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { HTTP_ERROR_CODE_MAP } from '../constants/http-error-code-map';

@Catch()  // 모든 예외를 잡음 (HttpException + 일반 Error 모두)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<{ url: string; headers: Record<string, string | undefined> }>();
    const response = http.getResponse<{
      setHeader: (name: string, value: string) => void;
      status: (code: number) => { json: (body: unknown) => void };
    }>();

    const status = this.resolveStatus(exception);

    // x-request-id 헤더가 있으면 재사용, 없으면 UUID 생성
    const requestId = this.resolveRequestId(request.headers['x-request-id']);
    const normalized = this.normalizeException(exception, status);

    const payload = {
      statusCode: status,
      code: HTTP_ERROR_CODE_MAP[status] ?? 'INTERNAL_SERVER_ERROR',
      message: normalized.message,
      path: request.url,
      requestId,
      timestamp: new Date().toISOString(),
      ...(normalized.details ? { details: normalized.details } : {}),
    };

    // 응답 헤더에도 requestId 포함 (클라이언트가 로그 추적에 활용 가능)
    response.setHeader('x-request-id', requestId);
    response.status(status).json(payload);
  }

  private resolveStatus(exception: unknown): number {
    if (exception instanceof HttpException) return exception.getStatus();
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private resolveRequestId(rawId: string | string[] | undefined): string {
    if (typeof rawId === 'string' && rawId.trim()) return rawId;
    if (Array.isArray(rawId) && rawId[0]?.trim()) return rawId[0];
    return randomUUID();
  }

  private normalizeException(exception: unknown, status: number) {
    if (exception instanceof HttpException) {
      const body = exception.getResponse();

      if (typeof body === 'string') return { message: body };

      if (body && typeof body === 'object') {
        const payload = body as Record<string, unknown>;
        const rawMessage = payload.message;

        // ValidationPipe가 message를 배열로 반환하는 경우 처리
        const message = Array.isArray(rawMessage)
          ? (rawMessage.find(v => typeof v === 'string') ?? 'Request failed')
          : (typeof rawMessage === 'string' ? rawMessage : 'Request failed');

        const details: Record<string, unknown> = {};
        if (Array.isArray(rawMessage)) details.validationErrors = rawMessage;
        if (typeof payload.error === 'string') details.error = payload.error;

        return { message, ...(Object.keys(details).length ? { details } : {}) };
      }
    }

    if (exception instanceof Error) {
      return status >= 500
        ? { message: 'Internal server error', details: { reason: exception.message } }
        : { message: exception.message };
    }

    return { message: status >= 500 ? 'Internal server error' : 'Request failed' };
  }
}
```

---

## 6-4. main.ts에 글로벌 등록

```typescript
// src/main.ts
import { ValidationPipe } from "@nestjs/common";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix("api", { exclude: ["health"] });

  // 요청 유효성 검사 (DTO class-validator 적용)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,           // DTO에 없는 필드 자동 제거
      transform: true,           // 타입 자동 변환 (string → number 등)
      forbidUnknownValues: true, // 알 수 없는 타입 거부
    }),
  );

  // 글로벌 에러 필터
  app.useGlobalFilters(new HttpExceptionFilter());

  // ...
}
```

---

## 6-5. 동작 확인

```bash
# 유효성 검사 에러 (question 누락)
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "test"}'

# 예상 응답
{
  "statusCode": 400,
  "code": "BAD_REQUEST",
  "message": "question must be a string",
  "path": "/api/chat",
  "requestId": "uuid-here",
  "timestamp": "...",
  "details": {
    "validationErrors": ["question must be a string", "question should not be empty"]
  }
}

# 존재하지 않는 경로
curl http://localhost:3000/api/nonexistent

# 예상 응답
{
  "statusCode": 404,
  "code": "NOT_FOUND",
  "message": "Cannot GET /api/nonexistent",
  ...
}
```

---

## 체크리스트

- [ ] `HTTP_ERROR_CODE_MAP` 상수 파일 생성
- [ ] `HttpExceptionFilter` 구현 (`@Catch()` 모든 예외)
- [ ] `main.ts`에 `useGlobalFilters` + `useGlobalPipes` 등록
- [ ] ValidationPipe 에러가 표준 형식으로 반환되는지 확인
- [ ] 500 에러도 표준 형식으로 반환되는지 확인

**→ [Phase 7](../phase-7-swagger/README.md)으로**
