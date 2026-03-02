import { Injectable } from '@nestjs/common';
import { Document } from '@langchain/core/documents';
import { VectorstoreService } from './vectorstore.service';

@Injectable()
export class RetrieverService {
  constructor(private readonly vectorstoreService: VectorstoreService) {}

  async retrieve(question: string): Promise<Document[]> {
    const k = Number(process.env.RETRIEVER_TOP_K ?? 5);
    return this.vectorstoreService.similaritySearch(question, k);
  }
}
