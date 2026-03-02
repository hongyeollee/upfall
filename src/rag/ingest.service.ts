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

  async onModuleInit(): Promise<void> {
    const defaultFilePath = path.join(process.cwd(), 'documents', 'ai-agent-market.pdf');

    try {
      await fs.access(defaultFilePath);
      await this.ingest(defaultFilePath);
      this.logger.log(`Auto-ingest completed: ${defaultFilePath}`);
    } catch (e) {
      this.logger.warn(
        `Auto-ingest skipped: ${e instanceof Error ? e.message : 'unknown error'}`,
      );
    }
  }

  async ingest(filePath: string): Promise<{ chunks: number; filePath: string }> {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    const fileBuffer = await fs.readFile(absolutePath);
    const parsed = await pdfParse(fileBuffer);

    const chunkSize = Number(process.env.CHUNK_SIZE ?? 1000);
    const chunkOverlap = Number(process.env.CHUNK_OVERLAP ?? 200);

    const chunks = this.chunkText(parsed.text, chunkSize, chunkOverlap);

    const docs = chunks.map(
      (chunk) =>
        new Document({
          pageContent: chunk,
          metadata: {
            source: absolutePath,
            title: parsed.info?.Title ?? 'ai-agent-market',
          },
        }),
    );

    const normalizedDocs = docs.map(
      (doc, index) =>
        new Document({
          pageContent: doc.pageContent,
          metadata: {
            ...doc.metadata,
            chunkIndex: index,
          },
        }),
    );

    const inserted = await this.vectorstoreService.addDocuments(normalizedDocs);
    return { chunks: inserted, filePath: absolutePath };
  }

  private chunkText(text: string, chunkSize: number, chunkOverlap: number): string[] {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return [];
    }

    const chunks: string[] = [];
    let cursor = 0;

    while (cursor < normalized.length) {
      const end = Math.min(cursor + chunkSize, normalized.length);
      chunks.push(normalized.slice(cursor, end));

      if (end === normalized.length) {
        break;
      }

      cursor = Math.max(0, end - chunkOverlap);
    }

    return chunks;
  }
}
