# Upfall 프로젝트 개발 가이드 (처음부터 혼자 만들기)

이 디렉토리는 **바이브코딩 없이 혼자서** 이 프로젝트를 처음부터 만들어낼 수 있도록 작성된 단계별 개발 가이드입니다.

## 이 프로젝트가 하는 일

```
PDF 업로드 → 벡터 DB 인덱싱 → 사용자 질문 → LLM이 문서 기반 답변 생성
```

**RAG (Retrieval-Augmented Generation)** 패턴의 AI Agent API입니다.

## 최종 기술 스택

| 영역 | 기술 |
|------|------|
| Backend 프레임워크 | NestJS (TypeScript) |
| LLM | OpenAI API |
| AI 오케스트레이션 | LangChain.js + LangGraph |
| 벡터 DB | ChromaDB (폴백: In-memory) |
| PDF 파싱 | pdf-parse |
| API 문서화 | Swagger (OpenAPI) |
| 배포 | Docker + Nginx |

## 전체 API 구조

```
GET  /health                    → 서비스 상태 확인
GET  /api/llm/models            → 지원 모델 목록
POST /api/rag/ingest            → PDF 인덱싱
POST /api/chat                  → 질문 → 문서 기반 답변
GET  /api/chat/history/:id      → 세션 대화 히스토리
GET  /api/docs                  → Swagger UI
```

## 최종 폴더 구조

```
src/
├── main.ts                          # 앱 진입점, Swagger 설정
├── app.module.ts                    # 루트 모듈
├── app.controller.ts                # /health 엔드포인트
├── llm/                             # Phase 3
│   ├── llm.module.ts
│   ├── llm.controller.ts
│   ├── llm-router.service.ts
│   └── dto/llm-models-response.dto.ts
├── rag/                             # Phase 4
│   ├── rag.module.ts
│   ├── rag.controller.ts
│   ├── ingest.service.ts
│   ├── retriever.service.ts
│   ├── vectorstore.service.ts
│   └── dto/
├── chat/                            # Phase 5
│   ├── chat.module.ts
│   ├── chat.controller.ts
│   ├── chat.service.ts
│   └── dto/
├── prompt/                          # Phase 5-1
│   └── prompt.template.ts
└── common/                          # Phase 6
    ├── constants/http-error-code-map.ts
    ├── filters/http-exception.filter.ts
    └── dto/error-response.dto.ts
```

---

## 개발 단계 목차

| Phase | 내용 | 예상 시간 | 링크 |
|-------|------|-----------|------|
| 0 | 설계 — 코드 전에 그려야 할 것들 | 1~2시간 | [→ phase-0-design](./phase-0-design/README.md) |
| 1 | 프로젝트 초기 설정 | 1시간 | [→ phase-1-setup](./phase-1-setup/README.md) |
| 2 | 환경변수 레이어 구축 | 30분 | [→ phase-2-env](./phase-2-env/README.md) |
| 3 | LLM 모듈 | 2~3시간 | [→ phase-3-llm](./phase-3-llm/README.md) |
| 4 | RAG / 벡터스토어 | 4~6시간 | [→ phase-4-rag](./phase-4-rag/README.md) |
| 5 | Chat 모듈 + LangGraph | 6~10시간 | [→ phase-5-chat](./phase-5-chat/README.md) |
| 6 | 에러 처리 표준화 | 2~3시간 | [→ phase-6-error-handling](./phase-6-error-handling/README.md) |
| 7 | Swagger 문서화 | 2~3시간 | [→ phase-7-swagger](./phase-7-swagger/README.md) |
| 8 | 헬스체크 엔드포인트 | 1시간 | [→ phase-8-health](./phase-8-health/README.md) |
| 9 | Docker 컨테이너화 | 3~5시간 | [→ phase-9-docker](./phase-9-docker/README.md) |
| 10 | 웹 UI (선택) | 2~3시간 | [→ phase-10-ui](./phase-10-ui/README.md) |

**총 예상: 24~37시간** (LangGraph, ChromaDB 처음 사용 시 디버깅 포함)

---

## 개발 원칙

1. **Phase마다 실행 확인 후 다음으로** — 한 번에 다 만들면 디버깅이 지옥이다
2. **폴백 먼저 설계** — ChromaDB 없어도 로컬에서 실행 가능하게
3. **DTO는 처음부터 엄격하게** — `class-validator` + `@ApiProperty()` 함께
4. **API 키 절대 하드코딩 금지** — `ConfigService`로만 읽기
5. **가장 단순한 것부터** — LLM → RAG → Chat 순서로

---

## 막혔을 때 체크리스트

- **ChromaDB 안 붙을 때**: `docker run -p 8000:8000 chromadb/chroma`
- **NestJS DI 에러**: 해당 Service가 Module의 `providers:[]`에 등록됐는지 확인
- **LangGraph 개념 이해 안 될 때**: StateGraph 공식 예제 먼저 실행해보기
- **타입 에러 폭탄**: `strict: true` 끄지 말고 타입을 제대로 정의할 것
- **임베딩 429 에러**: OpenAI 쿼터 확인, 또는 `EMBEDDING_PROVIDER=local`로 폴백 테스트
