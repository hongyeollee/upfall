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
    const graph = new StateGraph(AgentState)
      .addNode('retrieve', async (state: AgentStateType) => {
        const docs = await this.retrieverService.retrieve(state.question);
        return { retrievedDocs: docs };
      })
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
          if (!this.isQuotaError(error)) {
            throw error;
          }

          this.logger.warn('OpenAI quota exceeded, using extractive fallback response');
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

    const result = await graph.invoke({
      question: payload.question,
      model: payload.model,
      retrievedDocs: [],
      answer: '',
      modelUsed: '',
      references: [],
    });

    this.appendHistory(payload.sessionId, { role: 'user', content: payload.question, createdAt: new Date().toISOString() });
    this.appendHistory(payload.sessionId, { role: 'assistant', content: result.answer, createdAt: new Date().toISOString() });

    return {
      answer: result.answer,
      sessionId: payload.sessionId,
      modelUsed: result.modelUsed,
      references: result.references,
    };
  }

  getHistory(sessionId: string): { sessionId: string; messages: ChatHistoryMessage[] } {
    return {
      sessionId,
      messages: this.histories.get(sessionId) ?? [],
    };
  }

  private appendHistory(sessionId: string, message: ChatHistoryMessage): void {
    const prev = this.histories.get(sessionId) ?? [];
    this.histories.set(sessionId, [...prev, message]);
  }

  private buildContext(docs: Document[]): string {
    if (docs.length === 0) {
      return '검색된 문서 컨텍스트가 없습니다.';
    }

    return docs
      .map((doc, index) => {
        const source = String(doc.metadata?.source ?? 'unknown');
        const chunkIndex = String(doc.metadata?.chunkIndex ?? index);
        return `[문서 ${index + 1}]\n출처: ${source}#${chunkIndex}\n내용: ${doc.pageContent}`;
      })
      .join('\n\n');
  }

  private extractReferences(docs: Document[]): string[] {
    const refs = docs.map((doc, index) => {
      const source = String(doc.metadata?.source ?? 'unknown');
      const chunkIndex = String(doc.metadata?.chunkIndex ?? index);
      return `${source}#${chunkIndex}`;
    });

    return [...new Set(refs)];
  }

  private asText(content: unknown): string {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((item) => {
          if (typeof item === 'string') {
            return item;
          }
          if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') {
            return item.text;
          }
          return '';
        })
        .join(' ')
        .trim();
    }

    return '';
  }

  private isQuotaError(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return message.includes('429') || message.includes('quota') || message.includes('billing');
  }

  private buildExtractiveFallback(question: string, docs: Document[]): string {
    if (docs.length === 0) {
      return '해당 문서에 관련 내용이 없습니다. (출처: 검색 결과 없음)';
    }

    const ranked = docs
      .map((doc, index) => ({
        doc,
        index,
        score: this.scoreSnippet(question, doc.pageContent),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);

    const snippets = ranked.map(({ doc }) => this.extractBestSentence(question, doc.pageContent));
    const references = ranked.map(({ doc, index }) => {
      const source = String(doc.metadata?.source ?? 'unknown');
      const chunkIndex = String(doc.metadata?.chunkIndex ?? index);
      return `${source}#${chunkIndex}`;
    });

    return [
      `현재 모델 호출 한도 문제(429)로 문서 발췌 기반으로 답변합니다.`,
      `질문: ${question}`,
      ...snippets.map((snippet, index) => `${index + 1}. ${snippet}`),
      `(출처: ${references.join(', ')})`,
    ].join('\n');
  }

  private scoreSnippet(question: string, content: string): number {
    const qTokens = this.tokenize(question);
    const cTokens = new Set(this.tokenize(content));
    let overlap = 0;

    for (const token of qTokens) {
      if (cTokens.has(token)) {
        overlap += 1;
      }
    }

    const numericBonus = /\d/.test(content) ? 1 : 0;
    return overlap * 3 + numericBonus;
  }

  private extractBestSentence(question: string, content: string): string {
    const cleaned = content.replace(/\s+/g, ' ').trim();
    const sentences = cleaned
      .split(/(?<=[.!?])\s+|(?<=다\.)\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);

    if (sentences.length === 0) {
      return cleaned.length > 320 ? `${cleaned.slice(0, 320)}...` : cleaned;
    }

    const best = [...sentences]
      .map((sentence) => ({ sentence, score: this.scoreSnippet(question, sentence) }))
      .sort((a, b) => b.score - a.score)[0]?.sentence;

    if (!best) {
      return cleaned.length > 320 ? `${cleaned.slice(0, 320)}...` : cleaned;
    }

    return best.length > 320 ? `${best.slice(0, 320)}...` : best;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[^0-9a-zA-Z가-힣]+/)
      .filter((token) => token.length >= 2);
  }
}
