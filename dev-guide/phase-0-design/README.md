# Phase 0: 설계 — 코드 0줄, 그림부터

> 예상 시간: 1~2시간  
> 도구: 종이, 노션, 화이트보드 — 뭐든 상관없음

코드 한 줄 짜기 전에 이걸 안 하면 나중에 리팩토링 비용이 10배다.

---

## 0-1. 핵심 유저 시나리오 (3줄)

```
1. 사용자가 PDF 파일 경로를 넘긴다
2. 시스템이 PDF를 파싱해서 벡터 DB에 저장한다
3. 사용자가 질문하면 LLM이 문서 내용을 기반으로 답변한다
```

이 3줄이 전체 아키텍처를 결정한다.

---

## 0-2. API 엔드포인트 목록

손으로 써보는 것이 중요하다. 어떤 리소스가 필요한지 명확해진다.

```
# 문서 관련
POST /api/rag/ingest         → PDF 경로 받아서 벡터 DB 인덱싱

# 대화 관련
POST /api/chat               → 질문 → 문서 기반 답변
GET  /api/chat/history/:id   → 세션 대화 히스토리 조회

# 모델 관련
GET  /api/llm/models         → 지원 모델 목록 + 기본값

# 인프라
GET  /health                 → 서비스 상태 (ChromaDB 연결 여부 등)
GET  /api/docs               → Swagger UI
```

---

## 0-3. 데이터 흐름 다이어그램

### 문서 인덱싱 흐름 (ingest)

```
[PDF 파일]
    ↓ fs.readFile()
[Buffer]
    ↓ pdf-parse
[원본 텍스트]
    ↓ chunkText(size=1000, overlap=200)
[청크 배열: string[]]
    ↓ new Document({ pageContent, metadata })
[LangChain Document[]]
    ↓ OpenAIEmbeddings (text-embedding-3-small)
[벡터 배열: number[][]]
    ↓
[ChromaDB 저장] + [InMemory 백업]
```

### 질문-답변 흐름 (chat)

```
[사용자 질문: string]
    ↓ RetrieverService.retrieve()
    ↓ VectorstoreService.similaritySearch(query, k=5)
[관련 문서 청크: Document[]]
    ↓ buildContext()
[컨텍스트 문자열]
    ↓ SYSTEM_PROMPT.replace('{context}', context)
[최종 프롬프트]
    ↓ ChatOpenAI.invoke()
[LLM 답변: string]
    + references: ["file.pdf#chunkIndex"]
```

---

## 0-4. 폴더 구조 결정

NestJS는 **모듈 단위**로 구조를 잡는 게 핵심이다.  
각 모듈은 독립적으로 개발하고 테스트할 수 있어야 한다.

```
src/
├── llm/       → LLM 모델 선택 (가장 단순, Phase 3)
├── rag/       → 문서 처리 + 벡터스토어 (Phase 4)
├── chat/      → 질문-답변 로직 (Phase 5, llm + rag 의존)
├── prompt/    → 시스템 프롬프트 (Phase 5 내에서)
└── common/    → 에러 처리 공통 레이어 (Phase 6)
```

**의존 관계:**
```
chat → llm (LlmRouterService 주입)
chat → rag (RetrieverService 주입)
rag  → llm (임베딩에는 직접 openai 사용, llm 모듈 불필요)
```

---

## 0-5. 데이터 모델 스케치

### 요청 / 응답 형태 미리 정의

**POST /api/rag/ingest**
```json
// Request
{ "filePath": "documents/my-doc.pdf" }

// Response
{ "success": true, "chunks": 45, "filePath": "/abs/path/my-doc.pdf" }
```

**POST /api/chat**
```json
// Request
{ "question": "AI Agent 시장 규모는?", "sessionId": "user-001", "model": "gpt-5.2" }

// Response
{ "answer": "...", "sessionId": "user-001", "modelUsed": "gpt-5.2", "references": ["file.pdf#3"] }
```

**에러 응답 표준 형식** (모든 에러에 동일하게)
```json
{
  "statusCode": 400,
  "code": "BAD_REQUEST",
  "message": "question must be a string",
  "path": "/api/chat",
  "requestId": "uuid-here",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

---

## 0-6. 폴백 전략 결정

이걸 처음에 안 정하면 나중에 고치기 매우 어렵다.

| 상황 | 폴백 |
|------|------|
| ChromaDB 연결 불가 | In-memory 벡터스토어로 전환 |
| OpenAI 임베딩 429 | 로컬 해시 기반 임베딩 (256차원) |
| OpenAI LLM 429 | 추출식 요약 (키워드 겹침 스코어링) |
| 잘못된 모델명 | 기본값 `gpt-5.2`로 폴백 + 경고 로그 |

> **왜 폴백이 중요한가:** 로컬 개발 중 ChromaDB를 안 띄워도 앱이 실행되어야 한다.  
> OpenAI 쿼터가 없어도 기본 동작은 가능해야 한다.

---

## 체크리스트

- [ ] 유저 시나리오 3줄로 요약 완료
- [ ] API 엔드포인트 목록 작성 완료
- [ ] 데이터 흐름 그림 그리기 완료
- [ ] 폴더 구조 결정 완료
- [ ] 폴백 전략 결정 완료

**→ 체크 완료 후 [Phase 1](../phase-1-setup/README.md)로**
