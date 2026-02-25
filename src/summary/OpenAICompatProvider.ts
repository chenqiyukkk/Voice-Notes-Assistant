import type LectureRecorderPlugin from '../main';
import type { TranscriptionResult } from '../transcription/types';
import { buildSummaryPrompts } from './PromptTemplates';
import type {
  ISummaryProvider,
  ProviderValidationResult,
  SummaryOptions,
  SummaryRunResult,
} from './types';

interface OpenAICompatResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

export class OpenAICompatProvider implements ISummaryProvider {
  readonly name = 'OpenAI Compatible';
  readonly id = 'openai-compat';
  private plugin: LectureRecorderPlugin;

  constructor(plugin: LectureRecorderPlugin) {
    this.plugin = plugin;
  }

  async validateConfig(): Promise<ProviderValidationResult> {
    if (!normalizeSetting(this.plugin.settings.llmApiKey)) {
      return { valid: false, message: '总结 API Key 未配置' };
    }
    if (!normalizeSetting(this.plugin.settings.llmApiBaseUrl)) {
      return { valid: false, message: '总结 API Base URL 未配置' };
    }
    if (!normalizeSetting(this.plugin.settings.llmModel)) {
      return { valid: false, message: '总结模型名称未配置' };
    }
    return { valid: true, message: '配置有效' };
  }

  async summarize(
    transcription: TranscriptionResult,
    options: SummaryOptions,
    onProgress?: (message: string) => void,
  ): Promise<SummaryRunResult> {
    const validation = await this.validateConfig();
    if (!validation.valid) {
      throw new Error(validation.message);
    }

    const prompts = buildSummaryPrompts(transcription, options);
    const baseUrl = normalizeSetting(this.plugin.settings.llmApiBaseUrl).replace(/\/+$/, '');
    const model = normalizeSetting(this.plugin.settings.llmModel);
    const apiKey = normalizeSetting(this.plugin.settings.llmApiKey);

    onProgress?.(`正在调用 ${model} 生成课堂纪要`);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          { role: 'system', content: prompts.systemPrompt },
          { role: 'user', content: prompts.userPrompt },
        ],
      }),
    });

    const raw = await response.text();
    let payload: OpenAICompatResponse | null = null;
    try {
      payload = JSON.parse(raw) as OpenAICompatResponse;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const errorMessage = payload?.error?.message || raw || response.statusText;
      throw new Error(`总结请求失败 (${response.status}): ${errorMessage}`);
    }

    const summary = extractOpenAIContent(payload);
    if (!summary) {
      throw new Error('总结接口返回为空，请检查模型输出格式');
    }

    onProgress?.('课堂纪要生成完成');

    return {
      summary,
      metadata: {
        providerId: this.id,
        model,
        createdAt: new Date().toISOString(),
      },
    };
  }
}

function extractOpenAIContent(payload: OpenAICompatResponse | null): string {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((item) => (typeof item?.text === 'string' ? item.text.trim() : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

function normalizeSetting(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
