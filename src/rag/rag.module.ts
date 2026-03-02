import { Module } from '@nestjs/common';
import { RagController } from './rag.controller';
import { IngestService } from './ingest.service';
import { RetrieverService } from './retriever.service';
import { VectorstoreService } from './vectorstore.service';

@Module({
  providers: [VectorstoreService, IngestService, RetrieverService],
  exports: [VectorstoreService, IngestService, RetrieverService],
  controllers: [RagController],
})
export class RagModule {}
