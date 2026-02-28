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

interface ClaudeResponse {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  error?: {
    message?: string;
  };
}

export class ClaudeProvider implements ISummaryProvider {
  readonly name = 'Claude';
  readonly id = 'claude';
  private plugin: LectureRecorderPlugin;

  constructor(plugin: LectureRecorderPlugin) {
    this.plugin = plugin;
  }

  validateConfig(): Promise<ProviderValidationResult> {
    if (!normalizeSetting(this.plugin.settings.claudeApiKey)) {
      return Promise.resolve({ valid: false, message: 'Claude API key 未配置' });
    }
    if (!normalizeSetting(this.plugin.settings.claudeModel)) {
      return Promise.resolve({ valid: false, message: 'Claude 模型名称未配置' });
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
    const model = normalizeSetting(this.plugin.settings.claudeModel);
    const apiKey = normalizeSetting(this.plugin.settings.claudeApiKey);

    onProgress?.(`正在调用 ${model} 生成课堂纪要`);

    const response = await requestUrl({
      url: 'https://api.anthropic.com/v1/messages',
      method: 'POST',
      contentType: 'application/json',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 4096,
        system: prompts.systemPrompt,
        messages: [
          {
            role: 'user',
            content: prompts.userPrompt,
          },
        ],
      }),
      throw: false,
    });

    const raw = response.text || '';
    let payload: ClaudeResponse | null = null;
    try {
      payload = JSON.parse(raw) as ClaudeResponse;
    } catch {
      payload = null;
    }

    if (response.status >= 400) {
      const message = payload?.error?.message || raw || '请求失败';
      throw new Error(`Claude 总结请求失败 (${response.status}): ${message}`);
    }

    const summary = extractClaudeContent(payload);
    if (!summary) {
      throw new Error('Claude 返回内容为空，请检查模型输出');
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

function extractClaudeContent(payload: ClaudeResponse | null): string {
  const content = payload?.content;
  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((block) => {
      if (block?.type !== 'text') {
        return '';
      }
      return typeof block.text === 'string' ? block.text.trim() : '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

function normalizeSetting(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
