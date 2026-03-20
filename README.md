# NestJS AI Agent (RAG)

`nestjs-ai-agent-spec-v3.pdf` 명세를 기반으로 구현한 문서 참조형 AI Agent입니다.
질문에 대해 PDF 문서를 검색(Retrieval)한 뒤, 해당 컨텍스트를 근거로 답변을 생성합니다.

## 1) 프로젝트 개요

- 기술 스택: `NestJS 10`, `TypeScript strict`, `LangChain.js`, `LangGraph`
- LLM 라우팅: `LLM_MODEL` 환경변수 또는 요청 바디의 `model`로 동적 선택
- 벡터 저장소: 기본 `ChromaDB`, 장애 시 메모리 기반 검색 fallback
- 배포 구조: `docker-compose`로 `nestjs-app + chromadb + nginx` 통합 실행
- UI 제공: `public/index.html`에서 질문/모델 선택/응답 확인 가능

### 기술 선택 이유

- **개발 언어 선택 (`Node.js/NestJS`)**
  - 주력 개발 언어/프레임워크가 `Node.js (NestJS)`이기 때문에, 과제 구현 속도와 코드 품질(모듈화/DI/유지보수성)을 동시에 확보하기 유리했습니다.
  - NestJS의 DI 구조가 `LLM Router`, `Retriever`, `Ingest`, `Chat` 컴포넌트 분리에 적합했습니다.

- **LLM/문서화 도구 선택 (Claude + GPT 역할 분리)**
  - 긴 문맥 문서 분석/정리에 강점이 있는 Claude를 활용해 시장분석 문서를 읽고 개발 명세를 구조화했습니다.
  - 실제 코드 구현과 디버깅, 문제해결은 GPT의 강점을 활용해 진행했습니다.
  - 즉, 문서 분석(Claude) + 코드 구현/해결(GPT)로 역할을 분리해 과제 품질과 생산성을 높였습니다.

## 2) 핵심 동작 흐름

1. PDF를 읽어 텍스트 추출
2. 텍스트를 chunk로 분할
3. 임베딩 생성 후 벡터 스토어에 저장(ingest)
4. 질문 입력 시 유사 chunk 검색
5. 검색 결과를 컨텍스트로 LLM 응답 생성
6. 응답에 `modelUsed`, `references` 포함

## 3) 지원 API

- `POST /api/chat`
  - 요청: `{ "question": "...", "sessionId": "...", "model": "..."(optional) }`
  - 응답: `{ "answer", "sessionId", "modelUsed", "references" }`
- `GET /api/chat/history/:id`
- `POST /api/rag/ingest`
  - 요청: `{ "filePath": "documents/ai-agent-market.pdf" }` (optional)
- `GET /api/llm/models`
- `GET /health`

### API 문서

- Swagger UI: `GET /api/docs`
- Docker(권장): `http://localhost/api/docs`
- 로컬 단독 실행: `http://localhost:3000/api/docs`

### 공통 에러 응답 포맷

모든 애플리케이션 레벨 에러는 아래 구조로 통일됩니다.

```json
{
  "statusCode": 400,
  "code": "BAD_REQUEST",
  "message": "question must be a string",
  "path": "/api/chat",
  "requestId": "8f3f6df9-9f50-40e7-aa69-09f8ba4f80de",
  "timestamp": "2026-03-20T09:00:00.000Z",
  "details": {
    "validationErrors": [
      "question must be a string"
    ]
  }
}
```

에러 코드 매핑 규칙:

- `400 -> BAD_REQUEST`
- `404 -> NOT_FOUND`
- `500 -> INTERNAL_SERVER_ERROR`
- `413 -> PAYLOAD_TOO_LARGE` (Nginx 레이어)
- `502 -> BAD_GATEWAY` (Nginx 레이어)
- `504 -> GATEWAY_TIMEOUT` (Nginx 레이어)

## 4) 실행 방법

### A. 로컬 실행 (개발)

로컬 실행은 빠른 기능 확인에 적합하지만, Docker 실행 대비 일부 제약이 있습니다.

- ChromaDB를 별도로 띄우지 않으면 `vectorStore: memory` fallback으로 동작
- 메모리 저장소는 재시작 시 데이터가 유지되지 않아 ingest를 다시 수행해야 함
- Nginx reverse proxy 경유가 아닌 앱 단독 포트(`:3000`) 기준으로 테스트됨
- 운영과 동일한 네트워크/헬스체크 의존성 검증은 Docker에서만 가능

1. 의존성 설치

```bash
npm install
```

2. `.env` 파일 생성 후 값 설정

```env
OPENAI_API_KEY=sk-...
LLM_MODEL=gpt-5.2
CHROMA_URL=http://localhost:8000
CHROMA_COLLECTION=ai_agent_docs
CHUNK_SIZE=1000
CHUNK_OVERLAP=200
RETRIEVER_TOP_K=5
EMBEDDING_PROVIDER=openai
PORT=3000
```

3. 문서 파일 배치

```bash
cp "Market+Sharing+about+AI+Agent+-+Erica+Yu.pdf" documents/ai-agent-market.pdf
```

4. 앱 실행

```bash
npm run start:dev
```

5. 접속

- UI: `http://localhost:3000`
- Health: `http://localhost:3000/health`
- Swagger: `http://localhost:3000/api/docs`

### B. Docker 실행 (권장)

1. 환경변수 파일 준비

```bash
cp .env.docker.example .env.docker
```

2. `.env.docker` 값 입력 (`OPENAI_API_KEY` 필수)

3. 문서 파일 배치

```bash
cp "Market+Sharing+about+AI+Agent+-+Erica+Yu.pdf" documents/ai-agent-market.pdf
```

4. 전체 스택 실행

```bash
docker compose up --build -d
```

5. 접속

- UI: `http://localhost`
- API: `http://localhost/api/chat`
- Health: `http://localhost/health`
- Swagger: `http://localhost/api/docs`

## 5) 필수 점검 시나리오

1. Health 확인

```bash
curl http://localhost/health
```

2. 문서 ingest

```bash
curl -X POST http://localhost/api/rag/ingest \
  -H "Content-Type: application/json" \
  -d '{"filePath":"documents/ai-agent-market.pdf"}'
```

3. 채팅 요청

```bash
curl -X POST http://localhost/api/chat \
  -H "Content-Type: application/json" \
  -d '{"question":"AI Agent 시장 규모는 어떻게 되나요?","sessionId":"user-001"}'
```

## 6) 환경변수 설명

- `OPENAI_API_KEY`: OpenAI API 키
- `LLM_MODEL`: 기본 모델 (`gpt-5.2`, `gpt-5.2-pro`, `gpt-5-mini`, `gpt-5.1`)
- `CHROMA_URL`: ChromaDB 주소
- `CHROMA_COLLECTION`: 컬렉션 이름
- `CHUNK_SIZE`, `CHUNK_OVERLAP`: 문서 분할 설정
- `RETRIEVER_TOP_K`: 검색 top-k
- `EMBEDDING_PROVIDER`: `openai` 또는 `local`

## 7) 트러블슈팅

- `OpenAI ... API key not found`
  - `.env` 또는 `.env.docker`에 `OPENAI_API_KEY` 설정 확인
- `429 You exceeded your current quota`
  - OpenAI 한도 이슈입니다
  - 임베딩은 `EMBEDDING_PROVIDER=local`로 테스트 가능
  - 채팅은 quota 시 `modelUsed: fallback-extractive`로 발췌 응답 fallback 동작 가능
- `chromadb is unhealthy`
  - `docker compose ps`, `docker compose logs chromadb`로 상태 확인
  - 현재 compose는 최신 Chroma 동작 방식에 맞춘 healthcheck로 조정됨
- 답변이 "문서에 관련 내용이 없습니다"
  - 문서 ingest 재실행 필요 가능성 큼
  - 질문과 문서 언어/키워드가 맞는지 확인

## 8) 구현 메모

- 앱 시작 시 `documents/ai-agent-market.pdf` 자동 ingest 시도
- 자동 ingest 실패(파일 없음/키 문제 등)는 앱 종료 대신 경고 로그 처리
- 응답은 근거 추적을 위해 `references`를 항상 포함
