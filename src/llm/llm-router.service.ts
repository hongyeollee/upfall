import { Injectable, Logger } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';

export type SupportedModel = 'gpt-5.2' | 'gpt-5.2-pro' | 'gpt-5-mini' | 'gpt-5.1';

@Injectable()
export class LlmRouterService {
  private readonly logger = new Logger(LlmRouterService.name);
  private readonly defaultModel: SupportedModel = 'gpt-5.2';

  private readonly modelConfigs: Record<SupportedModel, { temperature: number }> = {
    'gpt-5.2': { temperature: 0.3 },
    'gpt-5.2-pro': { temperature: 0.2 },
    'gpt-5-mini': { temperature: 0.3 },
    'gpt-5.1': { temperature: 0.3 },
  };

  getSupportedModels(): SupportedModel[] {
    return Object.keys(this.modelConfigs) as SupportedModel[];
  }

  resolveModelName(overrideModel?: string): SupportedModel {
    const candidate = (overrideModel || process.env.LLM_MODEL || this.defaultModel) as SupportedModel;

    if (!this.modelConfigs[candidate]) {
      this.logger.warn(`Unknown model '${overrideModel}', fallback to ${this.defaultModel}`);
      return this.defaultModel;
    }

    return candidate;
  }

  getModel(overrideModel?: string): ChatOpenAI {
    const modelName = this.resolveModelName(overrideModel);
    return this.build(modelName);
  }

  private build(modelName: SupportedModel): ChatOpenAI {
    return new ChatOpenAI({
      model: modelName,
      temperature: this.modelConfigs[modelName].temperature,
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
}
