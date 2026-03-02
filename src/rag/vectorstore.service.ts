import { Injectable, Logger } from "@nestjs/common";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Chroma } from "@langchain/community/vectorstores/chroma";
import { Document } from "@langchain/core/documents";

type MemoryEntry = { doc: Document; vector: number[] };
type EmbeddingsLike = {
  embedDocuments(documents: string[]): Promise<number[][]>;
  embedQuery(document: string): Promise<number[]>;
};

@Injectable()
export class VectorstoreService {
  private readonly logger = new Logger(VectorstoreService.name);
  private store: Chroma | null = null;
  private usingMemoryFallback = false;
  private memoryEntries: MemoryEntry[] = [];
  private embeddings: OpenAIEmbeddings | null = null;
  private readonly localEmbeddingSize = 256;
  private forceLocalEmbeddings = false;

  private readonly chromaUrl =
    process.env.CHROMA_URL ?? "http://localhost:8000";
  private readonly collectionName =
    process.env.CHROMA_COLLECTION ?? "ai_agent_docs";

  async addDocuments(documents: Document[]): Promise<number> {
    if (documents.length === 0) {
      return 0;
    }

    await this.getStore();

    if (this.usingMemoryFallback) {
      await this.indexToMemory(documents);
      return documents.length;
    }

    await this.store?.addDocuments(documents);
    await this.indexToMemory(documents);
    return documents.length;
  }

  async similaritySearch(query: string, k: number): Promise<Document[]> {
    await this.getStore();

    if (this.usingMemoryFallback) {
      return this.similaritySearchFromMemory(query, k);
    }

    try {
      return (await this.store?.similaritySearch(query, k)) ?? [];
    } catch (error) {
      this.logger.warn(
        `Chroma similaritySearch failed, switching to memory fallback: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      this.usingMemoryFallback = true;
      return this.similaritySearchFromMemory(query, k);
    }
  }

  isUsingMemoryFallback(): boolean {
    return this.usingMemoryFallback;
  }

  async pingChroma(): Promise<boolean> {
    try {
      const v2Response = await fetch(`${this.chromaUrl}/api/v2/heartbeat`);
      if (v2Response.ok) {
        return true;
      }

      const v1Response = await fetch(`${this.chromaUrl}/api/v1/heartbeat`);
      return v1Response.ok;
    } catch {
      return false;
    }
  }

  async ensureStoreReady(): Promise<void> {
    await this.getStore();
  }

  private async getStore(): Promise<void> {
    if (this.store || this.usingMemoryFallback) {
      return;
    }

    const chromaAlive = await this.pingChroma();

    if (chromaAlive) {
      this.store = new Chroma(this.getEmbeddings(), {
        url: this.chromaUrl,
        collectionName: this.collectionName,
      });
      this.usingMemoryFallback = false;
      this.logger.log(`Connected to ChromaDB (${this.collectionName})`);
      return;
    }

    this.logger.warn("ChromaDB unavailable, using MemoryVectorStore fallback");
    this.usingMemoryFallback = true;
    this.memoryEntries = [];
  }

  private getEmbeddings(): EmbeddingsLike {
    if (this.useLocalEmbeddings()) {
      return this.buildLocalEmbeddings();
    }

    if (this.embeddings) {
      return this.embeddings;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required');
    }

    this.embeddings = new OpenAIEmbeddings({
      model: 'text-embedding-3-small',
      apiKey,
    });

    return this.embeddings;
  }

  private async embedDocuments(documents: string[]): Promise<number[][]> {
    try {
      return await this.getEmbeddings().embedDocuments(documents);
    } catch (error) {
      if (this.shouldFallbackToLocalEmbeddings(error)) {
        this.forceLocalEmbeddings = true;
        this.logger.warn('OpenAI embedding quota exceeded, switching to local embeddings fallback');
        return this.buildLocalEmbeddings().embedDocuments(documents);
      }
      throw error;
    }
  }

  private async indexToMemory(documents: Document[]): Promise<void> {
    const vectors = await this.embedDocuments(documents.map((doc) => doc.pageContent));
    this.memoryEntries.push(
      ...documents.map((doc, idx) => ({
        doc,
        vector: vectors[idx],
      })),
    );
  }

  private async similaritySearchFromMemory(query: string, k: number): Promise<Document[]> {
    if (this.memoryEntries.length === 0) {
      return [];
    }

    const queryVector = await this.embedQuery(query);
    return [...this.memoryEntries]
      .map((entry) => ({
        doc: entry.doc,
        score: this.cosineSimilarity(queryVector, entry.vector),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map((item) => item.doc);
  }

  private async embedQuery(query: string): Promise<number[]> {
    try {
      return await this.getEmbeddings().embedQuery(query);
    } catch (error) {
      if (this.shouldFallbackToLocalEmbeddings(error)) {
        this.forceLocalEmbeddings = true;
        this.logger.warn('OpenAI embedding quota exceeded, switching to local embeddings fallback');
        return this.buildLocalEmbeddings().embedQuery(query);
      }
      throw error;
    }
  }

  private shouldFallbackToLocalEmbeddings(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return message.includes('429') || message.includes('quota') || message.includes('billing');
  }

  private useLocalEmbeddings(): boolean {
    const provider = (process.env.EMBEDDING_PROVIDER ?? 'openai').toLowerCase();
    return provider === 'local' || this.forceLocalEmbeddings;
  }

  private buildLocalEmbeddings(): EmbeddingsLike {
    return {
      embedDocuments: async (documents: string[]) => documents.map((doc) => this.hashEmbed(doc)),
      embedQuery: async (document: string) => this.hashEmbed(document),
    };
  }

  private hashEmbed(text: string): number[] {
    const normalized = text.toLowerCase();
    const vector = Array.from({ length: this.localEmbeddingSize }, () => 0);

    for (let i = 0; i < normalized.length; i += 1) {
      const charCode = normalized.charCodeAt(i);
      const index = (charCode * 31 + i) % this.localEmbeddingSize;
      vector[index] += 1;
    }

    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (norm === 0) {
      return vector;
    }

    return vector.map((value) => value / norm);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let magA = 0;
    let magB = 0;

    for (let i = 0; i < a.length; i += 1) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }

    if (magA === 0 || magB === 0) {
      return 0;
    }

    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
  }
}
