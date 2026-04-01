# Phase 5: Chat 모듈 + LangGraph

> 예상 시간: 6~10시간 (이 프로젝트에서 가장 어려운 파트)  
> 완료 기준: `POST /api/chat`으로 PDF 내용 관련 질문 시 정확한 답변 반환

---

## 5-1. 프롬프트 템플릿 (먼저!)

`src/prompt/prompt.template.ts`

프롬프트를 코드와 분리해두면 나중에 수정이 쉽다.

```typescript
export const SYSTEM_PROMPT = `
당신은 AI Agent 시장 분석 문서 전문 어시스턴트입니다.
다음 규칙을 반드시 따르세요:
1. 반드시 제공된 [컨텍스트] 내용만을 근거로 답변하세요.
2. 컨텍스트에 없는 내용은 '해당 문서에 관련 내용이 없습니다'라고 답하세요.
3. 답변은 한국어로 작성하세요.
4. 수치, 통계, 회사명은 정확히 인용하세요.
5. 답변 마지막에 참조한 섹션 또는 출처를 명시하세요.

[컨텍스트]
{context}

[Few-shot 예시]
Q: AI Agent 시장 규모는?
A: 2024년 기준 51억 달러이며, 2030년까지 471억 달러로 성장할 것으로 예측됩니다. (출처: 섹션 2.3)
`;
```

**프롬프트 작성 원칙:**
1. **컨텍스트만 사용하라** → Hallucination 방지
2. **모르면 모른다고** → 신뢰성 확보
3. **출처 인용** → 검증 가능성
4. **Few-shot 예시** → LLM이 원하는 형식으로 답변하도록 유도

---

## 5-2. LangGraph 개념 이해

LangGraph는 AI 워크플로를 **노드(node) + 엣지(edge)** 의 그래프로 정의한다.

```
START → [retrieve 노드] → [generate 노드] → END
```

각 노드는 현재 상태(State)를 받아서 업데이트된 상태를 반환한다.

```typescript
// 상태 정의
const AgentState = Annotation.Root({
  question: Annotation<string>(),        // 입력: 사용자 질문
  model: Annotation<string | undefined>(),
  retrievedDocs: Annotation<Document[]>(),  // retrieve 노드가 채움
  answer: Annotation<string>(),          // generate 노드가 채움
  modelUsed: Annotation<string>(),
  references: Annotation<string[]>(),
});

// 워크플로 정의
const graph = new StateGraph(AgentState)
  .addNode('retrieve', retrieveNode)
  .addNode('generate', generateNode)
  .addEdge(START, 'retrieve')
  .addEdge('retrieve', 'generate')
  .addEdge('generate', END)
  .compile();

// 실행
const result = await graph.invoke({ question: "질문", ... });
```

---

## 5-3. DTO 정의

`src/chat/dto/chat.dto.ts`
```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class ChatDto {
  @ApiProperty({ example: 'AI Agent 시장 규모는?' })
  @IsString()
  @MinLength(1)
  question: string;

  @ApiProperty({ example: 'session-001', description: '세션 ID (멀티턴 대화 유지)' })
  @IsString()
  sessionId: string;

  @ApiPropertyOptional({ example: 'gpt-4o-mini' })
  @IsOptional()
  @IsString()
  model?: string;
}
```

`src/chat/dto/chat-response.dto.ts`
```typescript
import { ApiProperty } from '@nestjs/swagger';

export class ChatResponseDto {
  @ApiProperty() answer: string;
  @ApiProperty() sessionId: string;
  @ApiProperty() modelUsed: string;
  @ApiProperty({ type: [String] }) references: string[];
}
```

`src/chat/dto/chat-history-response.dto.ts`
```typescript
import { ApiProperty } from '@nestjs/swagger';

class MessageDto {
  @ApiProperty({ enum: ['user', 'assistant'] }) role: 'user' | 'assistant';
  @ApiProperty() content: string;
  @ApiProperty() createdAt: string;
}

export class ChatHistoryResponseDto {
  @ApiProperty() sessionId: string;
  @ApiProperty({ type: [MessageDto] }) messages: MessageDto[];
}
```

---

## 5-4. ChatService 구현

`src/chat/chat.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Document } from '@langchain/core/documents';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { LlmRouterService } from '../llm/llm-router.service';
import { SYSTEM_PROMPT } from '../prompt/prompt.template';
import { RetrieverService } from '../rag/retriever.service';

type ChatHistoryMessage = {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

// LangGraph 상태 스키마 정의
const AgentState = Annotation.Root({
  question: Annotation<string>(),
  model: Annotation<string | undefined>(),
  retrievedDocs: Annotation<Document[]>(),
  answer: Annotation<string>(),
  modelUsed: Annotation<string>(),
  references: Annotation<string[]>(),
});

type AgentStateType = typeof AgentState.State;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  // 세션별 대화 히스토리 (인메모리, 재시작 시 초기화됨)
  private readonly histories = new Map<string, ChatHistoryMessage[]>();

  constructor(
    private readonly retrieverService: RetrieverService,
    private readonly llmRouterService: LlmRouterService,
  ) {}

  async chat(payload: {
    question: string;
    sessionId: string;
    model?: string;
  }): Promise<{ answer: string; sessionId: string; modelUsed: string; references: string[] }> {

    // LangGraph 워크플로 정의
    const graph = new StateGraph(AgentState)
      // 노드 1: 문서 검색
      .addNode('retrieve', async (state: AgentStateType) => {
        const docs = await this.retrieverService.retrieve(state.question);
        return { retrievedDocs: docs };
      })
      // 노드 2: LLM 답변 생성
      .addNode('generate', async (state: AgentStateType) => {
        const modelName = this.llmRouterService.resolveModelName(state.model);
        const context = this.buildContext(state.retrievedDocs ?? []);
        const references = this.extractReferences(state.retrievedDocs ?? []);

        try {
          const llm = this.llmRouterService.getModel(modelName);
          const prompt = `${SYSTEM_PROMPT.replace('{context}', context)}\n\n[질문]\n${state.question}`;
          const response = await llm.invoke(prompt);

          return {
            answer: this.asText(response.content),
            modelUsed: modelName,
            references,
          };
        } catch (error) {
          // OpenAI 429 에러 → 추출식 요약으로 폴백
          if (!this.isQuotaError(error)) throw error;

          this.logger.warn('OpenAI quota exceeded, using extractive fallback');
          return {
            answer: this.buildExtractiveFallback(state.question, state.retrievedDocs ?? []),
            modelUsed: 'fallback-extractive',
            references,
          };
        }
      })
      .addEdge(START, 'retrieve')
      .addEdge('retrieve', 'generate')
      .addEdge('generate', END)
      .compile();

    // 워크플로 실행
    const result = await graph.invoke({
      question: payload.question,
      model: payload.model,
      retrievedDocs: [],
      answer: '',
      modelUsed: '',
      references: [],
    });

    // 히스토리 저장
    this.appendHistory(payload.sessionId, { role: 'user', content: payload.question, createdAt: new Date().toISOString() });
    this.appendHistory(payload.sessionId, { role: 'assistant', content: result.answer, createdAt: new Date().toISOString() });

    return {
      answer: result.answer,
      sessionId: payload.sessionId,
      modelUsed: result.modelUsed,
      references: result.references,
    };
  }

  getHistory(sessionId: string) {
    return {
      sessionId,
      messages: this.histories.get(sessionId) ?? [],
    };
  }

  private appendHistory(sessionId: string, message: ChatHistoryMessage): void {
    const prev = this.histories.get(sessionId) ?? [];
    this.histories.set(sessionId, [...prev, message]);
  }

  // 검색된 문서를 LLM 컨텍스트 문자열로 변환
  private buildContext(docs: Document[]): string {
    if (docs.length === 0) return '검색된 문서 컨텍스트가 없습니다.';

    return docs
      .map((doc, index) => {
        const source = String(doc.metadata?.source ?? 'unknown');
        const chunkIndex = String(doc.metadata?.chunkIndex ?? index);
        return `[문서 ${index + 1}]\n출처: ${source}#${chunkIndex}\n내용: ${doc.pageContent}`;
      })
      .join('\n\n');
  }

  // 참조 문서 목록 추출 (중복 제거)
  private extractReferences(docs: Document[]): string[] {
    const refs = docs.map((doc, index) => {
      const source = String(doc.metadata?.source ?? 'unknown');
      const chunkIndex = String(doc.metadata?.chunkIndex ?? index);
      return `${source}#${chunkIndex}`;
    });
    return [...new Set(refs)];
  }

  // LLM 응답 content → string 변환 (형식이 다양함)
  private asText(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map(item => typeof item === 'string' ? item : (item?.text ?? ''))
        .join(' ').trim();
    }
    return '';
  }

  private isQuotaError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return msg.includes('429') || msg.includes('quota') || msg.includes('billing');
  }

  // 429 폴백: 키워드 겹침 기반 추출식 요약
  private buildExtractiveFallback(question: string, docs: Document[]): string {
    if (docs.length === 0) return '해당 문서에 관련 내용이 없습니다.';

    const ranked = docs
      .map((doc, index) => ({ doc, index, score: this.scoreSnippet(question, doc.pageContent) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);

    const snippets = ranked.map(({ doc }) => this.extractBestSentence(question, doc.pageContent));
    const references = ranked.map(({ doc, index }) =>
      `${doc.metadata?.source ?? 'unknown'}#${doc.metadata?.chunkIndex ?? index}`
    );

    return [
      `현재 모델 호출 한도 문제(429)로 문서 발췌 기반으로 답변합니다.`,
      `질문: ${question}`,
      ...snippets.map((s, i) => `${i + 1}. ${s}`),
      `(출처: ${references.join(', ')})`,
    ].join('\n');
  }

  private scoreSnippet(question: string, content: string): number {
    const qTokens = this.tokenize(question);
    const cTokens = new Set(this.tokenize(content));
    const overlap = qTokens.filter(t => cTokens.has(t)).length;
    return overlap * 3 + (/\d/.test(content) ? 1 : 0);
  }

  private extractBestSentence(question: string, content: string): string {
    const sentences = content.replace(/\s+/g, ' ').trim()
      .split(/(?<=[.!?])\s+|(?<=다\.)\s+/)
      .filter(Boolean);

    if (sentences.length === 0) return content.slice(0, 320);

    const best = sentences
      .map(s => ({ s, score: this.scoreSnippet(question, s) }))
      .sort((a, b) => b.score - a.score)[0]?.s ?? '';

    return best.length > 320 ? `${best.slice(0, 320)}...` : best;
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase().split(/[^0-9a-zA-Z가-힣]+/).filter(t => t.length >= 2);
  }
}
```

---

## 5-5. Controller

`src/chat/chat.controller.ts`

```typescript
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { ChatDto } from './dto/chat.dto';
import { ChatHistoryResponseDto } from './dto/chat-history-response.dto';
import { ChatResponseDto } from './dto/chat-response.dto';

@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @ApiOperation({ summary: '문서 기반 질의응답' })
  @ApiOkResponse({ type: ChatResponseDto })
  @Post()
  async chat(@Body() dto: ChatDto): Promise<ChatResponseDto> {
    return this.chatService.chat({
      question: dto.question,
      sessionId: dto.sessionId,
      model: dto.model,
    });
  }

  @ApiOperation({ summary: '세션 대화 히스토리 조회' })
  @ApiOkResponse({ type: ChatHistoryResponseDto })
  @Get('history/:id')
  getHistory(@Param('id') id: string): ChatHistoryResponseDto {
    return this.chatService.getHistory(id);
  }
}
```

---

## 5-6. Module 정의

`src/chat/chat.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { RagModule } from '../rag/rag.module';

@Module({
  imports: [RagModule],   // RetrieverService를 주입받기 위해 필요
  providers: [ChatService],
  controllers: [ChatController],
})
export class ChatModule {}
```

> `LlmRouterService`는 `@Global()` 모듈이라 `imports` 없이 주입 가능.  
> `RetrieverService`는 `RagModule`에서 `exports`된 것을 `imports: [RagModule]`로 받아온다.

---

## 5-7. AppModule에 등록

```typescript
// src/app.module.ts
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '.env.docker'] }),
    LlmModule,
    RagModule,
    ChatModule,  // 추가
  ],
  controllers: [AppController],
})
export class AppModule {}
```

---

## 5-8. 테스트

```bash
# 1. 먼저 PDF 인제스트
curl -X POST http://localhost:3000/api/rag/ingest \
  -H "Content-Type: application/json" \
  -d '{"filePath": "documents/ai-agent-market.pdf"}'

# 2. 질문
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "AI Agent 시장 규모는?", "sessionId": "test-001"}'

# 3. 히스토리 확인
curl http://localhost:3000/api/chat/history/test-001
```

성공 응답 예시:
```json
{
  "answer": "2024년 기준 AI Agent 시장 규모는 51억 달러입니다...",
  "sessionId": "test-001",
  "modelUsed": "gpt-4o-mini",
  "references": ["/abs/path/ai-agent-market.pdf#3", "/abs/path/ai-agent-market.pdf#7"]
}
```

---

## 주요 디버깅 포인트

| 증상 | 원인 | 해결 |
|------|------|------|
| `Cannot inject RetrieverService` | `ChatModule`에 `imports: [RagModule]` 누락 | `imports` 추가 |
| LangGraph 타입 에러 | `Annotation.Root` 스키마 불일치 | 초기값과 스키마 타입 맞추기 |
| 답변이 "문서에 없음"만 나옴 | 인제스트 안 됨 or 유사도 검색 0건 | 인제스트 먼저, k값 확인 |
| LLM 응답이 빈 문자열 | `asText()` 처리 필요 | content 타입 확인 |

---

## 체크리스트

- [ ] `prompt.template.ts` 작성 완료
- [ ] `ChatService` with LangGraph StateGraph 구현
- [ ] 세션 히스토리 (`Map<sessionId, messages[]>`) 동작 확인
- [ ] 429 폴백 (`buildExtractiveFallback`) 구현
- [ ] `POST /api/chat` 실제 답변 반환 확인
- [ ] `GET /api/chat/history/:id` 히스토리 반환 확인

**→ [Phase 6](../phase-6-error-handling/README.md)으로**
