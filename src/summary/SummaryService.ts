import type LectureRecorderPlugin from '../main';
import type { TranscriptionResult, TranscriptionSegment } from '../transcription/types';
import { ClaudeProvider } from './ClaudeProvider';
import { OpenAICompatProvider } from './OpenAICompatProvider';
import type {
  ISummaryProvider,
  SummaryOptions,
  SummaryRunResult,
} from './types';

type ProviderId = 'openai-compat' | 'claude';

export class SummaryService {
  private plugin: LectureRecorderPlugin;
  private providers = new Map<ProviderId, ISummaryProvider>();

  constructor(plugin: LectureRecorderPlugin) {
    this.plugin = plugin;
    this.registerProvider(new OpenAICompatProvider(plugin));
    this.registerProvider(new ClaudeProvider(plugin));
  }

  async summarize(
    transcription: TranscriptionResult,
    options: SummaryOptions,
    onProgress?: (message: string) => void,
  ): Promise<SummaryRunResult> {
    const provider = this.getCurrentProvider();
    const validation = await provider.validateConfig();
    if (!validation.valid) {
      throw new Error(validation.message);
    }

    if (this.shouldUseHierarchicalSummarization(transcription)) {
      return await this.summarizeHierarchically(provider, transcription, options, onProgress);
    }

    return await provider.summarize(transcription, options, onProgress);
  }

  private async summarizeHierarchically(
    provider: ISummaryProvider,
    transcription: TranscriptionResult,
    options: SummaryOptions,
    onProgress?: (message: string) => void,
  ): Promise<SummaryRunResult> {
    const chunkLimit = this.resolveChunkCharLimit();
    const chunks = this.splitTranscription(transcription, chunkLimit);

    if (chunks.length <= 1) {
      return await provider.summarize(transcription, options, onProgress);
    }

    onProgress?.(`检测到长转写，启用分段总结（共 ${chunks.length} 段）`);

    const partialSummaries: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunkIndex = i + 1;
      onProgress?.(`分段总结中 (${chunkIndex}/${chunks.length})`);

      const chunkResult = await provider.summarize(
        chunks[i],
        {
          context: options.context,
          template: buildChunkTemplate(chunkIndex, chunks.length),
        },
        (message) => onProgress?.(`分段 ${chunkIndex}/${chunks.length}: ${message}`),
      );

      partialSummaries.push(
        `### 分段 ${chunkIndex}/${chunks.length}\n${chunkResult.summary.trim()}`,
      );
    }

    onProgress?.('正在合并分段总结为最终课堂纪要');

    const mergedTranscription: TranscriptionResult = {
      segments: [],
      fullText: partialSummaries.join('\n\n'),
      language: transcription.language,
      duration: transcription.duration,
      providerId: transcription.providerId,
      createdAt: new Date().toISOString(),
    };

    return await provider.summarize(
      mergedTranscription,
      {
        context: options.context,
        template: buildMergeTemplate(options.template),
      },
      (message) => onProgress?.(`合并阶段: ${message}`),
    );
  }

  private shouldUseHierarchicalSummarization(transcription: TranscriptionResult): boolean {
    if (!this.plugin.settings.summaryEnableHierarchical) {
      return false;
    }
    const fullText = normalizeText(transcription.fullText);
    if (!fullText) {
      return false;
    }
    return fullText.length > this.resolveChunkCharLimit();
  }

  private resolveChunkCharLimit(): number {
    const configured = this.plugin.settings.summaryChunkCharLimit;
    if (typeof configured !== 'number' || !Number.isFinite(configured)) {
      return 12000;
    }
    return Math.max(4000, Math.floor(configured));
  }

  private splitTranscription(
    transcription: TranscriptionResult,
    maxChars: number,
  ): TranscriptionResult[] {
    const validSegments = normalizeSegments(transcription.segments);
    if (validSegments.length > 0) {
      return splitBySegments(transcription, validSegments, maxChars);
    }
    return splitByFullText(transcription, maxChars);
  }

  private registerProvider(provider: ISummaryProvider): void {
    this.providers.set(provider.id as ProviderId, provider);
  }

  private getCurrentProvider(): ISummaryProvider {
    const providerId = this.plugin.settings.summaryProvider as ProviderId;
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`未找到总结 Provider: ${providerId}`);
    }
    return provider;
  }
}

function splitBySegments(
  transcription: TranscriptionResult,
  segments: TranscriptionSegment[],
  maxChars: number,
): TranscriptionResult[] {
  const chunks: TranscriptionResult[] = [];
  let bucket: TranscriptionSegment[] = [];
  let charCount = 0;

  const flush = () => {
    if (bucket.length === 0) {
      return;
    }
    const first = bucket[0];
    const last = bucket[bucket.length - 1];
    chunks.push({
      segments: bucket,
      fullText: bucket.map(seg => seg.text).join('\n').trim(),
      language: transcription.language,
      duration: Math.max(0, last.end - first.start),
      providerId: transcription.providerId,
      createdAt: transcription.createdAt,
    });
    bucket = [];
    charCount = 0;
  };

  for (const segment of segments) {
    const segmentLen = segment.text.length + 16;
    if (bucket.length > 0 && charCount + segmentLen > maxChars) {
      flush();
    }

    bucket.push(segment);
    charCount += segmentLen;
  }

  flush();

  return chunks;
}

function splitByFullText(
  transcription: TranscriptionResult,
  maxChars: number,
): TranscriptionResult[] {
  const text = normalizeText(transcription.fullText);
  if (!text) {
    return [transcription];
  }

  const paragraphs = text
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean);

  if (paragraphs.length <= 1 && text.length <= maxChars) {
    return [transcription];
  }

  const chunks: string[] = [];
  let current = '';
  for (const paragraph of paragraphs.length > 0 ? paragraphs : [text]) {
    if (!current) {
      current = paragraph;
      continue;
    }

    if ((current.length + paragraph.length + 2) <= maxChars) {
      current = `${current}\n\n${paragraph}`;
    } else {
      chunks.push(current);
      current = paragraph;
    }
  }

  if (current) {
    chunks.push(current);
  }

  if (chunks.length === 1 && chunks[0].length > maxChars) {
    return forceSplitText(transcription, chunks[0], maxChars);
  }

  return chunks.map((chunk, idx) => ({
    segments: [],
    fullText: chunk,
    language: transcription.language,
    duration: transcription.duration,
    providerId: transcription.providerId,
    createdAt: transcription.createdAt || new Date().toISOString(),
  }));
}

function forceSplitText(
  transcription: TranscriptionResult,
  text: string,
  maxChars: number,
): TranscriptionResult[] {
  const chunks: TranscriptionResult[] = [];
  for (let i = 0; i < text.length; i += maxChars) {
    const part = text.slice(i, i + maxChars).trim();
    if (!part) {
      continue;
    }
    chunks.push({
      segments: [],
      fullText: part,
      language: transcription.language,
      duration: transcription.duration,
      providerId: transcription.providerId,
      createdAt: transcription.createdAt || new Date().toISOString(),
    });
  }
  return chunks.length > 0 ? chunks : [transcription];
}

function normalizeSegments(segments: TranscriptionSegment[] | undefined): TranscriptionSegment[] {
  if (!Array.isArray(segments)) {
    return [];
  }
  return segments
    .filter((segment) => normalizeText(segment?.text))
    .map((segment) => ({
      start: Number.isFinite(segment.start) ? Math.max(0, segment.start) : 0,
      end: Number.isFinite(segment.end)
        ? Math.max(segment.start || 0, segment.end)
        : (segment.start || 0),
      text: normalizeText(segment.text),
    }));
}

function normalizeText(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function buildChunkTemplate(index: number, total: number): string {
  return [
    `你正在处理课堂转写的第 ${index}/${total} 段。`,
    '请输出“分段纪要”，用于后续全局合并。',
    '输出必须使用 Markdown，包含：',
    '1. 本段主题',
    '2. 核心要点（3-5条）',
    '3. 关键时间点（如有）',
    '4. 本段疑问或易错点',
    '不要尝试给出整节课的最终结论。',
  ].join('\n');
}

function buildMergeTemplate(customTemplate: string | undefined): string {
  const baseTemplate = typeof customTemplate === 'string' ? customTemplate.trim() : '';
  const fallback = [
    '请将“分段纪要”合并为一份完整课堂纪要。',
    '输出必须使用中文 Markdown，包含：',
    '1. 核心要点',
    '2. 详细内容（带时间戳）',
    '3. 关键术语表',
    '4. 复习建议',
    '若分段信息冲突，请给出最稳妥的统一表述。',
  ].join('\n');

  if (!baseTemplate) {
    return fallback;
  }

  return [
    '请将分段纪要合并为最终纪要，并尽量遵循以下模板约束：',
    baseTemplate,
    '',
    '你可以在不违背事实的前提下调整结构，以保证可读性。',
  ].join('\n');
}
