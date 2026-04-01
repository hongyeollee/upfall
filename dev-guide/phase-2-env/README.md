# Phase 2: 환경변수 레이어 구축

> 예상 시간: 30분  
> 완료 기준: `ConfigService`로 `OPENAI_API_KEY` 읽기 성공

---

## 왜 이걸 먼저 하는가

- API 키를 코드에 하드코딩하면 → git에 올라감 → API 키 유출
- 환경마다 다른 설정 (로컬 vs Docker vs 프로덕션)을 코드 변경 없이 관리
- NestJS의 `ConfigModule`을 글로벌로 설정하면 어느 모듈에서든 주입 가능

---

## 2-1. .env 파일 생성

프로젝트 루트에 `.env` 파일 생성:

```bash
# .env

# 필수
OPENAI_API_KEY=sk-proj-...여기에_실제_키_입력...

# 선택 (기본값 있음)
LLM_MODEL=gpt-4o-mini
CHROMA_URL=http://localhost:8000
CHROMA_COLLECTION=ai_agent_docs
CHUNK_SIZE=1000
CHUNK_OVERLAP=200
RETRIEVER_TOP_K=5
EMBEDDING_PROVIDER=openai
PORT=3000
```

Docker 배포용 `.env.docker`도 함께 만들어둔다:

```bash
# .env.docker
OPENAI_API_KEY=sk-proj-...
LLM_MODEL=gpt-4o-mini
CHROMA_URL=http://chromadb:8000    # Docker 내부 서비스명 사용
CHROMA_COLLECTION=ai_agent_docs
CHUNK_SIZE=1000
CHUNK_OVERLAP=200
RETRIEVER_TOP_K=5
EMBEDDING_PROVIDER=openai
```

---

## 2-2. .gitignore 업데이트 (중요!)

```bash
# .gitignore에 추가
.env
.env.docker
.env.local
.env.*.local
```

**이걸 빠뜨리면 API 키가 GitHub에 공개된다.**

---

## 2-3. AppModule에 ConfigModule 설정

```typescript
// src/app.module.ts
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,             // 모든 모듈에서 주입 없이 사용 가능
      envFilePath: [".env", ".env.docker"],  // 순서대로 읽음, 앞이 우선
    }),
    // Phase 3부터 LlmModule, RagModule, ChatModule 추가 예정
  ],
  controllers: [AppController],
})
export class AppModule {}
```

> `isGlobal: true`를 설정하면 각 모듈에 `ConfigModule`을 `imports`에 추가할 필요 없다.

---

## 2-4. 환경변수 읽기 방법 2가지

### 방법 A: `ConfigService` 주입 (권장)
```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MyService {
  constructor(private readonly config: ConfigService) {}

  someMethod() {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    const port = this.config.get<number>('PORT') ?? 3000;
  }
}
```

### 방법 B: `process.env` 직접 접근
```typescript
const apiKey = process.env.OPENAI_API_KEY;
```

> 이 프로젝트 코드에서는 실용성 때문에 `process.env`를 직접 읽는 부분도 있다.  
> 어느 방법이든 일관성을 유지하는 게 중요하다.

---

## 2-5. 확인

```typescript
// src/app.controller.ts (임시 확인용)
@Get('health')
health() {
  return {
    status: 'ok',
    hasApiKey: !!process.env.OPENAI_API_KEY,
  };
}
```

`http://localhost:3000/health` → `{ "status": "ok", "hasApiKey": true }` 가 나오면 성공.

---

## 체크리스트

- [ ] `.env` 파일 생성 완료 (실제 API 키 입력)
- [ ] `.gitignore`에 `.env` 추가 완료
- [ ] `ConfigModule.forRoot({ isGlobal: true })` 설정 완료
- [ ] `/health`에서 `hasApiKey: true` 확인

**→ [Phase 3](../phase-3-llm/README.md)으로**
