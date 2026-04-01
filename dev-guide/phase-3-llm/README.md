# Phase 3: LLM 모듈

> 예상 시간: 2~3시간  
> 완료 기준: `GET /api/llm/models` 호출 시 모델 목록 JSON 반환

**왜 가장 먼저 만드나:** 다른 모든 모듈(rag, chat)이 이 모듈의 `LlmRouterService`를 주입받아 쓴다.  
또한 NestJS의 Module / Service / Controller / DI 패턴을 이해하기에 가장 단순한 모듈이다.

---

## 3-1. NestJS 핵심 패턴 이해 (개념)

모든 것은 아래 3개의 파일로 구성된다:

```
Module  →  Provider들을 등록하고 다른 모듈에 공개
Service →  비즈니스 로직 담당 (@Injectable)
Controller → HTTP 요청 처리 (@Controller, @Get, @Post 등)
```

**의존성 주입(DI) 동작 방식:**
```typescript
// Service를 다른 Service/Controller에 주입하려면:
// 1. providers에 등록
// 2. exports에 공개 (다른 모듈에서 쓰려면)
// 3. 사용하는 클래스 생성자에서 선언

@Module({
  providers: [MyService],    // 1. 등록
  exports: [MyService],      // 2. 공개
})
export class MyModule {}

@Injectable()
export class AnotherService {
  constructor(private readonly myService: MyService) {} // 3. 주입
}
```

---

## 3-2. 파일 생성

```
src/llm/
├── llm.module.ts
├── llm.controller.ts
├── llm-router.service.ts
└── dto/
    └── llm-models-response.dto.ts
```

---

## 3-3. LlmRouterService 구현

`src/llm/llm-router.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';

// 지원 모델을 타입으로 정의 (오타 방지)
export type SupportedModel = 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4-turbo';

@Injectable()
export class LlmRouterService {
  private readonly logger = new Logger(LlmRouterService.name);
  private readonly defaultModel: SupportedModel = 'gpt-4o-mini';

  // 모델별 설정 (temperature 등)
  private readonly modelConfigs: Record<SupportedModel, { temperature: number }> = {
    'gpt-4o': { temperature: 0.2 },
    'gpt-4o-mini': { temperature: 0.3 },
    'gpt-4-turbo': { temperature: 0.3 },
  };

  // 지원 모델 목록 반환
  getSupportedModels(): SupportedModel[] {
    return Object.keys(this.modelConfigs) as SupportedModel[];
  }

  // 모델명 검증 + 폴백
  resolveModelName(overrideModel?: string): SupportedModel {
    const candidate = (overrideModel || process.env.LLM_MODEL || this.defaultModel) as SupportedModel;

    if (!this.modelConfigs[candidate]) {
      this.logger.warn(`Unknown model '${overrideModel}', fallback to ${this.defaultModel}`);
      return this.defaultModel;
    }

    return candidate;
  }

  // ChatOpenAI 인스턴스 반환
  getModel(overrideModel?: string): ChatOpenAI {
    const modelName = this.resolveModelName(overrideModel);
    return new ChatOpenAI({
      model: modelName,
      temperature: this.modelConfigs[modelName].temperature,
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
}
```

**핵심 설계 포인트:**
- `resolveModelName()`: 유효하지 않은 모델명 → 기본값으로 폴백, 경고 로그
- `getModel()`: ChatOpenAI 인스턴스를 매번 새로 만들어 반환 (stateless)
- `modelConfigs`: 모델별 temperature를 중앙 관리

---

## 3-4. DTO 정의

`src/llm/dto/llm-models-response.dto.ts`

```typescript
import { ApiProperty } from '@nestjs/swagger';

export class LlmModelsResponseDto {
  @ApiProperty({ example: 'gpt-4o-mini' })
  defaultModel: string;

  @ApiProperty({ example: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'] })
  supportedModels: string[];
}
```

---

## 3-5. Controller 구현

`src/llm/llm.controller.ts`

```typescript
import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LlmModelsResponseDto } from './dto/llm-models-response.dto';
import { LlmRouterService } from './llm-router.service';

@ApiTags('llm')
@Controller('llm')
export class LlmController {
  constructor(private readonly llmRouterService: LlmRouterService) {}

  @ApiOperation({ summary: '지원 모델 목록 조회' })
  @ApiOkResponse({ type: LlmModelsResponseDto })
  @Get('models')
  getModels(): LlmModelsResponseDto {
    return {
      defaultModel: process.env.LLM_MODEL ?? 'gpt-4o-mini',
      supportedModels: this.llmRouterService.getSupportedModels(),
    };
  }
}
```

---

## 3-6. Module 정의

`src/llm/llm.module.ts`

```typescript
import { Global, Module } from '@nestjs/common';
import { LlmController } from './llm.controller';
import { LlmRouterService } from './llm-router.service';

@Global()   // ← 이게 핵심: 다른 모듈에서 imports 없이 주입 가능
@Module({
  providers: [LlmRouterService],
  exports: [LlmRouterService],   // ← 다른 모듈에서 사용할 수 있게 공개
  controllers: [LlmController],
})
export class LlmModule {}
```

> `@Global()` 데코레이터: `LlmRouterService`를 ChatModule, RagModule 등 어디서든  
> `imports`에 `LlmModule`을 추가하지 않아도 주입받을 수 있게 해준다.

---

## 3-7. AppModule에 등록

```typescript
// src/app.module.ts
import { LlmModule } from './llm/llm.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '.env.docker'] }),
    LlmModule,  // 추가
  ],
  controllers: [AppController],
})
export class AppModule {}
```

---

## 3-8. 테스트

```bash
# 서버 실행
npm run start:dev

# 모델 목록 조회
curl http://localhost:3000/api/llm/models
```

예상 응답:
```json
{
  "defaultModel": "gpt-4o-mini",
  "supportedModels": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"]
}
```

---

## 이 단계에서 배우는 것

- NestJS Module / Service / Controller 패턴
- `@Global()` — 글로벌 모듈로 만들기
- `@Injectable()` — DI 컨테이너에 등록
- DTO에 `@ApiProperty()` 붙이는 습관

---

## 체크리스트

- [ ] `src/llm/` 디렉토리 생성 완료
- [ ] `LlmRouterService` 구현 완료
- [ ] `LlmModule`에 `@Global()` + `exports` 설정 완료
- [ ] `AppModule`에 `LlmModule` 등록 완료
- [ ] `GET /api/llm/models` 응답 확인

**→ [Phase 4](../phase-4-rag/README.md)로**
