# Phase 8: 헬스체크 엔드포인트

> 예상 시간: 1시간  
> 완료 기준: `GET /health`에서 ChromaDB 상태, 벡터스토어 모드, 기본 모델 반환

---

## 왜 헬스체크가 필요한가

- Docker의 `healthcheck`가 이 엔드포인트를 주기적으로 호출해 서비스 상태 확인
- Nginx가 앱이 준비됐는지 판단하는 기준
- 개발 중 "ChromaDB가 연결됐나?" "인메모리 폴백 중인가?" 즉시 확인 가능

---

## 8-1. 응답 DTO

`src/dto/health-response.dto.ts`

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ enum: ['ok', 'degraded'], example: 'ok' })
  status: 'ok' | 'degraded';

  @ApiProperty({ enum: ['up', 'down'], example: 'up' })
  chroma: 'up' | 'down';

  @ApiProperty({ enum: ['chroma', 'memory'], example: 'chroma' })
  vectorStore: 'chroma' | 'memory';

  @ApiProperty({ example: 'gpt-4o-mini' })
  modelDefault: string;

  @ApiPropertyOptional({ description: '초기화 오류 메시지 (degraded 상태일 때만)' })
  detail?: string;
}
```

---

## 8-2. AppController 구현

`src/app.controller.ts`

```typescript
import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthResponseDto } from './dto/health-response.dto';
import { VectorstoreService } from './rag/vectorstore.service';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly vectorstoreService: VectorstoreService) {}

  @ApiOperation({
    summary: '서비스 헬스 체크',
    description: 'ChromaDB 연결 상태, 벡터스토어 동작 모드, 기본 모델을 반환합니다.',
  })
  @ApiOkResponse({ type: HealthResponseDto })
  @Get('health')
  async health(): Promise<HealthResponseDto> {
    let storeInitError: string | undefined;

    // 벡터스토어 초기화 시도
    try {
      await this.vectorstoreService.ensureStoreReady();
    } catch (error) {
      storeInitError = error instanceof Error ? error.message : 'store init failed';
    }

    const chromaOk = await this.vectorstoreService.pingChroma();
    const usingMemory = this.vectorstoreService.isUsingMemoryFallback();

    return {
      // chroma or memory 중 하나라도 동작하면 ok
      status: !storeInitError && (chromaOk || usingMemory) ? 'ok' : 'degraded',
      chroma: chromaOk ? 'up' : 'down',
      vectorStore: usingMemory ? 'memory' : 'chroma',
      modelDefault: process.env.LLM_MODEL ?? 'gpt-4o-mini',
      ...(storeInitError ? { detail: storeInitError } : {}),
    };
  }
}
```

---

## 8-3. AppModule에서 VectorstoreService 주입

`AppController`가 `VectorstoreService`를 쓰려면 `AppModule`이 접근할 수 있어야 한다.  
`RagModule`이 `VectorstoreService`를 `exports`하고 있으므로:

```typescript
// src/app.module.ts
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '.env.docker'] }),
    LlmModule,
    RagModule,   // VectorstoreService가 여기서 export됨
    ChatModule,
  ],
  controllers: [AppController],  // AppController는 자동으로 RagModule의 export 사용 가능
})
export class AppModule {}
```

---

## 8-4. 응답 케이스별 예시

### ChromaDB 연결 정상
```json
{
  "status": "ok",
  "chroma": "up",
  "vectorStore": "chroma",
  "modelDefault": "gpt-4o-mini"
}
```

### ChromaDB 없음, 인메모리 폴백 중
```json
{
  "status": "ok",
  "chroma": "down",
  "vectorStore": "memory",
  "modelDefault": "gpt-4o-mini"
}
```

### 벡터스토어 초기화 실패
```json
{
  "status": "degraded",
  "chroma": "down",
  "vectorStore": "memory",
  "modelDefault": "gpt-4o-mini",
  "detail": "OPENAI_API_KEY is required"
}
```

---

## 8-5. 테스트

```bash
# ChromaDB 없이
npm run start:dev
curl http://localhost:3000/health
# → { "status": "ok", "chroma": "down", "vectorStore": "memory", ... }

# ChromaDB 띄우고
docker run -d -p 8000:8000 chromadb/chroma
curl http://localhost:3000/health
# → { "status": "ok", "chroma": "up", "vectorStore": "chroma", ... }
```

---

## 주의사항

- `/health`는 `api` 글로벌 프리픽스에서 **제외**해야 한다 (`exclude: ["health"]`)
- Docker healthcheck는 `http://localhost:3000/health`를 직접 호출함

```typescript
// main.ts
app.setGlobalPrefix("api", { exclude: ["health"] });
//                            ↑ 이게 없으면 /api/health가 되어 Docker healthcheck 실패
```

---

## 체크리스트

- [ ] `HealthResponseDto` 생성 완료
- [ ] `AppController`에 `GET /health` 구현
- [ ] `VectorstoreService` 주입 동작 확인
- [ ] `main.ts`에서 `health` 경로 prefix 제외 확인
- [ ] ChromaDB 있/없 양쪽 시나리오 응답 확인

**→ [Phase 9](../phase-9-docker/README.md)로**
