# Phase 4: RAG 모듈 — 벡터스토어 구축

> 예상 시간: 4~6시간  
> 완료 기준: PDF 인제스트 후 `POST /api/rag/ingest` 성공 응답

**핵심:** 이 Phase는 구현 순서가 매우 중요하다.  
아래 순서를 지키지 않으면 의존 관계 때문에 막힌다.

```
VectorstoreService → IngestService → RetrieverService → Controller
(가장 하위)                                              (가장 상위)
```

---

## 파일 구조

```
src/rag/
├── rag.module.ts
├── rag.controller.ts
├── ingest.service.ts
├── retriever.service.ts
├── vectorstore.service.ts
└── dto/
    ├── ingest.dto.ts
    └── ingest-response.dto.ts
```

---

## 4-1. VectorstoreService (가장 먼저)

`src/rag/vectorstore.service.ts`

이 서비스가 핵심이다. ChromaDB 연결 + 실패 시 인메모리 폴백을 담당한다.

```typescript
import { Injectable, Logger } from "@nestjs/common";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Chroma } from "@langchain/community/vectorstores/chroma";
import { Document } from "@langchain/core/documents";

type MemoryEntry = { doc: Document; vector: number[] };

@Injectable()
export class VectorstoreService {
  private readonly logger = new Logger(VectorstoreService.name);
  private store: Chroma | null = null;
  private usingMemoryFallback = false;   // 폴백 여부 플래그
  private memoryEntries: MemoryEntry[] = [];  // 인메모리 저장소
  private embeddings: OpenAIEmbeddings | null = null;
  private forceLocalEmbeddings = false;  // 임베딩 폴백 플래그

  private readonly chromaUrl = process.env.CHROMA_URL ?? "http://localhost:8000";
  private readonly collectionName = process.env.CHROMA_COLLECTION ?? "ai_agent_docs";

  // 문서 추가 (외부에서 사용하는 메서드)
  async addDocuments(documents: Document[]): Promise<number> {
    if (documents.length === 0) return 0;

    await this.getStore();  // ChromaDB 연결 or 폴백 결정

    if (this.usingMemoryFallback) {
      await this.indexToMemory(documents);
      return documents.length;
    }

    await this.store?.addDocuments(documents);
    await this.indexToMemory(documents);  // 항상 인메모리에도 백업
    return documents.length;
  }

  // 유사도 검색 (외부에서 사용하는 메서드)
  async similaritySearch(query: string, k: number): Promise<Document[]> {
    await this.getStore();

    if (this.usingMemoryFallback) {
      return this.similaritySearchFromMemory(query, k);
    }

    try {
      return (await this.store?.similaritySearch(query, k)) ?? [];
    } catch {
      this.usingMemoryFallback = true;
      return this.similaritySearchFromMemory(query, k);
    }
  }

  // 상태 노출 (헬스체크에서 사용)
  isUsingMemoryFallback(): boolean { return this.usingMemoryFallback; }
  async ensureStoreReady(): Promise<void> { await this.getStore(); }

  // ChromaDB 헬스체크
  async pingChroma(): Promise<boolean> {
    try {
      const res = await fetch(`${this.chromaUrl}/api/v2/heartbeat`);
      if (res.ok) return true;
      const res1 = await fetch(`${this.chromaUrl}/api/v1/heartbeat`);
      return res1.ok;
    } catch {
      return false;
    }
  }

  // ChromaDB 연결 or 폴백 결정 (내부 메서드)
  private async getStore(): Promise<void> {
    if (this.store || this.usingMemoryFallback) return;

    const chromaAlive = await this.pingChroma();

    if (chromaAlive) {
      this.store = new Chroma(this.getEmbeddings(), {
        url: this.chromaUrl,
        collectionName: this.collectionName,
      });
      this.logger.log(`Connected to ChromaDB (${this.collectionName})`);
      return;
    }

    this.logger.warn("ChromaDB unavailable, using MemoryVectorStore fallback");
    this.usingMemoryFallback = true;
  }

  // 임베딩 인스턴스 반환 (OpenAI or 로컬 해시)
  private getEmbeddings() {
    if (this.useLocalEmbeddings()) return this.buildLocalEmbeddings();

    if (!this.embeddings) {
      this.embeddings = new OpenAIEmbeddings({
        model: 'text-embedding-3-small',
        apiKey: process.env.OPENAI_API_KEY,
      });
    }
    return this.embeddings;
  }

  private async indexToMemory(documents: Document[]): Promise<void> {
    const texts = documents.map(d => d.pageContent);
    const vectors = await this.embedDocuments(texts);
    this.memoryEntries.push(...documents.map((doc, i) => ({ doc, vector: vectors[i] })));
  }

  private async embedDocuments(documents: string[]): Promise<number[][]> {
    try {
      return await this.getEmbeddings().embedDocuments(documents);
    } catch (error) {
      if (this.shouldFallbackToLocalEmbeddings(error)) {
        this.forceLocalEmbeddings = true;
        this.logger.warn('OpenAI embedding quota exceeded, switching to local embeddings');
        return this.buildLocalEmbeddings().embedDocuments(documents);
      }
      throw error;
    }
  }

  private async similaritySearchFromMemory(query: string, k: number): Promise<Document[]> {
    if (this.memoryEntries.length === 0) return [];

    const queryVector = await this.getEmbeddings().embedQuery(query);
    return [...this.memoryEntries]
      .map(entry => ({ doc: entry.doc, score: this.cosineSimilarity(queryVector, entry.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(item => item.doc);
  }

  private shouldFallbackToLocalEmbeddings(error: unknown): boolean {
    const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return msg.includes('429') || msg.includes('quota') || msg.includes('billing');
  }

  private useLocalEmbeddings(): boolean {
    return (process.env.EMBEDDING_PROVIDER ?? 'openai').toLowerCase() === 'local'
      || this.forceLocalEmbeddings;
  }

  // 로컬 해시 기반 임베딩 (OpenAI 없어도 동작)
  private buildLocalEmbeddings() {
    return {
      embedDocuments: async (docs: string[]) => docs.map(d => this.hashEmbed(d)),
      embedQuery: async (doc: string) => this.hashEmbed(doc),
    };
  }

  private hashEmbed(text: string): number[] {
    const size = 256;
    const vec = Array(size).fill(0);
    const normalized = text.toLowerCase();

    for (let i = 0; i < normalized.length; i++) {
      const idx = (normalized.charCodeAt(i) * 31 + i) % size;
      vec[idx] += 1;
    }

    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    return norm === 0 ? vec : vec.map(v => v / norm);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    return (magA === 0 || magB === 0) ? 0 : dot / (Math.sqrt(magA) * Math.sqrt(magB));
  }
}
```

### VectorstoreService 핵심 설계 포인트

| 포인트 | 설명 |
|--------|------|
| `usingMemoryFallback` 플래그 | ChromaDB 상태를 한 번만 체크하고 캐시 |
| `indexToMemory()` 항상 실행 | ChromaDB 연결 중에도 인메모리에 백업 → 빠른 폴백 전환 |
| `pingChroma()` | 실제 연결 전 헬스체크 → 긴 타임아웃 방지 |
| 로컬 해시 임베딩 | 256차원 결정론적 벡터 → OpenAI 없어도 동작 |

---

## 4-2. IngestService

`src/rag/ingest.service.ts`

```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Document } from '@langchain/core/documents';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as pdfParse from 'pdf-parse';
import { VectorstoreService } from './vectorstore.service';

@Injectable()
export class IngestService implements OnModuleInit {
  private readonly logger = new Logger(IngestService.name);

  constructor(private readonly vectorstoreService: VectorstoreService) {}

  // 앱 시작 시 기본 PDF 자동 인제스트
  async onModuleInit(): Promise<void> {
    const defaultPath = path.join(process.cwd(), 'documents', 'ai-agent-market.pdf');
    try {
      await fs.access(defaultPath);
      await this.ingest(defaultPath);
      this.logger.log(`Auto-ingest completed: ${defaultPath}`);
    } catch (e) {
      this.logger.warn(`Auto-ingest skipped: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }

  async ingest(filePath: string): Promise<{ chunks: number; filePath: string }> {
    // 절대경로 변환
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(process.cwd(), filePath);

    // PDF 파싱
    const fileBuffer = await fs.readFile(absolutePath);
    const parsed = await pdfParse(fileBuffer);

    // 환경변수에서 청크 설정 읽기
    const chunkSize = Number(process.env.CHUNK_SIZE ?? 1000);
    const chunkOverlap = Number(process.env.CHUNK_OVERLAP ?? 200);

    // 텍스트 → 청크 배열
    const chunks = this.chunkText(parsed.text, chunkSize, chunkOverlap);

    // LangChain Document 객체로 변환
    const docs = chunks.map((chunk, index) =>
      new Document({
        pageContent: chunk,
        metadata: {
          source: absolutePath,
          title: parsed.info?.Title ?? 'document',
          chunkIndex: index,
        },
      })
    );

    // 벡터스토어에 저장
    const inserted = await this.vectorstoreService.addDocuments(docs);
    return { chunks: inserted, filePath: absolutePath };
  }

  // 슬라이딩 윈도우 방식 청킹
  private chunkText(text: string, chunkSize: number, chunkOverlap: number): string[] {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) return [];

    const chunks: string[] = [];
    let cursor = 0;

    while (cursor < normalized.length) {
      const end = Math.min(cursor + chunkSize, normalized.length);
      chunks.push(normalized.slice(cursor, end));
      if (end === normalized.length) break;
      cursor = Math.max(0, end - chunkOverlap);  // 오버랩만큼 뒤로
    }

    return chunks;
  }
}
```

### 청킹 방식 이해

```
텍스트: [----1000자----][오버랩200][----1000자----][오버랩200]...

cursor=0   → chunk[0] = text[0..1000]
cursor=800 → chunk[1] = text[800..1800]  (200자 오버랩)
cursor=1600 → chunk[2] = text[1600..2600]
```

오버랩이 있어야 청크 경계에서 잘린 내용도 검색될 수 있다.

---

## 4-3. RetrieverService

`src/rag/retriever.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { Document } from '@langchain/core/documents';
import { VectorstoreService } from './vectorstore.service';

@Injectable()
export class RetrieverService {
  constructor(private readonly vectorstoreService: VectorstoreService) {}

  async retrieve(query: string): Promise<Document[]> {
    const k = Number(process.env.RETRIEVER_TOP_K ?? 5);
    return this.vectorstoreService.similaritySearch(query, k);
  }
}
```

얇은 래퍼다. 나중에 재순위, 필터링 등 검색 로직을 추가할 공간.

---

## 4-4. DTO 정의

`src/rag/dto/ingest.dto.ts`
```typescript
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class IngestDto {
  @ApiPropertyOptional({ example: 'documents/my-doc.pdf' })
  @IsOptional()
  @IsString()
  filePath?: string;
}
```

`src/rag/dto/ingest-response.dto.ts`
```typescript
import { ApiProperty } from '@nestjs/swagger';

export class IngestResponseDto {
  @ApiProperty() success: boolean;
  @ApiProperty() chunks: number;
  @ApiProperty() filePath: string;
}
```

---

## 4-5. Controller

`src/rag/rag.controller.ts`

```typescript
import { Body, Controller, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IngestDto } from './dto/ingest.dto';
import { IngestResponseDto } from './dto/ingest-response.dto';
import { IngestService } from './ingest.service';

@ApiTags('rag')
@Controller('rag')
export class RagController {
  constructor(private readonly ingestService: IngestService) {}

  @ApiOperation({ summary: 'PDF 문서 인덱싱' })
  @ApiOkResponse({ type: IngestResponseDto })
  @Post('ingest')
  async ingest(@Body() dto: IngestDto): Promise<IngestResponseDto> {
    const filePath = dto.filePath ?? 'documents/ai-agent-market.pdf';
    const result = await this.ingestService.ingest(filePath);
    return { success: true, ...result };
  }
}
```

---

## 4-6. Module 정의

`src/rag/rag.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { RagController } from './rag.controller';
import { IngestService } from './ingest.service';
import { RetrieverService } from './retriever.service';
import { VectorstoreService } from './vectorstore.service';

@Module({
  providers: [VectorstoreService, IngestService, RetrieverService],
  exports: [RetrieverService, VectorstoreService],  // ChatModule, AppController에서 사용
  controllers: [RagController],
})
export class RagModule {}
```

---

## 4-7. AppModule에 등록

```typescript
// src/app.module.ts
import { RagModule } from './rag/rag.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '.env.docker'] }),
    LlmModule,
    RagModule,  // 추가
  ],
  controllers: [AppController],
})
export class AppModule {}
```

---

## 4-8. 테스트

```bash
# 서버 실행
npm run start:dev
# 시작 로그에 "Auto-ingest completed" 또는 "Auto-ingest skipped" 보임

# PDF 인제스트 테스트
curl -X POST http://localhost:3000/api/rag/ingest \
  -H "Content-Type: application/json" \
  -d '{"filePath": "documents/ai-agent-market.pdf"}'
```

성공 응답:
```json
{
  "success": true,
  "chunks": 45,
  "filePath": "/abs/path/documents/ai-agent-market.pdf"
}
```

ChromaDB가 없으면 로그에 `"ChromaDB unavailable, using MemoryVectorStore fallback"` 출력 후 정상 동작.

---

## 체크리스트

- [ ] `VectorstoreService` 구현 + ChromaDB 폴백 동작 확인
- [ ] `IngestService` — PDF 파싱 + 청킹 + 벡터스토어 저장
- [ ] `RetrieverService` — `retrieve()` 메서드
- [ ] `POST /api/rag/ingest` 응답 확인
- [ ] ChromaDB 없이도 실행 확인 (메모리 폴백)

**→ [Phase 5](../phase-5-chat/README.md)로**
