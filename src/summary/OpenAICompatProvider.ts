import { requestUrl } from 'obsidian';
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

  validateConfig(): Promise<ProviderValidationResult> {
    if (!normalizeSetting(this.plugin.settings.llmApiKey)) {
      return Promise.resolve({ valid: false, message: '总结 API key 未配置' });
    }
    if (!normalizeSetting(this.plugin.settings.llmApiBaseUrl)) {
      return Promise.resolve({ valid: false, message: '总结 API base URL 未配置' });
    }
    if (!normalizeSetting(this.plugin.settings.llmModel)) {
      return Promise.resolve({ valid: false, message: '总结模型名称未配置' });
    }
    return Promise.resolve({ valid: true, message: '配置有效' });
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

    const response = await requestUrl({
      url: `${baseUrl}/chat/completions`,
      method: 'POST',
      contentType: 'application/json',
      headers: {
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
      throw: false,
    });

    const raw = response.text || '';
    let payload: OpenAICompatResponse | null = null;
    try {
      payload = JSON.parse(raw) as OpenAICompatResponse;
    } catch {
      payload = null;
    }

    if (response.status >= 400) {
      const errorMessage = payload?.error?.message || raw || '请求失败';
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
