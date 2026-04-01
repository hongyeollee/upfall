# Phase 1: 프로젝트 초기 설정

> 예상 시간: 1시간  
> 완료 기준: `npm run start:dev` 실행 시 `http://localhost:3000` 응답

---

## 1-1. NestJS 프로젝트 생성

```bash
# NestJS CLI 글로벌 설치
npm i -g @nestjs/cli

# 프로젝트 생성 (패키지 매니저: npm 선택)
nest new upfall

cd upfall
```

생성 직후 구조:
```
src/
├── app.controller.ts
├── app.controller.spec.ts
├── app.module.ts
├── app.service.ts
└── main.ts
```

> `app.service.ts`와 `app.controller.spec.ts`는 나중에 삭제하거나 내용을 교체할 것.

---

## 1-2. 의존성 한꺼번에 설치

버전 충돌을 방지하려면 처음에 한꺼번에 설치하는 게 좋다.

```bash
# NestJS 추가 패키지
npm install @nestjs/config @nestjs/swagger swagger-ui-express

# AI / LLM
npm install @langchain/openai @langchain/community @langchain/langgraph langchain @langchain/core

# 벡터 DB
npm install chromadb

# 문서 처리
npm install pdf-parse

# 유효성 검사
npm install class-validator class-transformer

# 타입 정의
npm install --save-dev @types/pdf-parse
```

---

## 1-3. tsconfig.json 확인

NestJS 기본 설정이 이미 strict 모드지만, 반드시 확인:

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,            // 반드시 true
    "strictNullChecks": true,
    "esModuleInterop": true,
    "experimentalDecorators": true,   // NestJS 데코레이터 필수
    "emitDecoratorMetadata": true,    // DI 리플렉션 필수
    "target": "ES2021",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

> `experimentalDecorators`와 `emitDecoratorMetadata`가 없으면 NestJS DI가 동작하지 않는다.

---

## 1-4. main.ts 기본 구조

`src/main.ts`를 아래처럼 준비한다 (나중에 Swagger 등 추가 예정):

```typescript
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api", { exclude: ["health"] });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`Server running on http://localhost:${port}`);
}

void bootstrap();
```

> `import "reflect-metadata"` — 반드시 최상단에 있어야 한다. NestJS DI 시스템이 의존한다.

---

## 1-5. 실행 확인

```bash
npm run start:dev
```

터미널에 다음이 보이면 성공:
```
[Nest] LOG [NestFactory] Starting Nest application...
[Nest] LOG [NestApplication] Nest application successfully started +Xms
Server running on http://localhost:3000
```

브라우저에서 `http://localhost:3000/health` → 404 (아직 엔드포인트 없음) 또는 기본 Nest 응답이 오면 OK.

---

## 체크리스트

- [ ] `nest new upfall` 완료
- [ ] 의존성 설치 완료 (node_modules 존재)
- [ ] `tsconfig.json`에 `experimentalDecorators: true` 확인
- [ ] `npm run start:dev` 실행 성공

**→ [Phase 2](../phase-2-env/README.md)로**
