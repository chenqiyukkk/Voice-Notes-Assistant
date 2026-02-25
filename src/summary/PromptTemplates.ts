import type { TranscriptionResult, TranscriptionSegment } from '../transcription/types';
import type { SummaryContext, SummaryOptions } from './types';

const DEFAULT_TEMPLATE = [
  '# {{courseName}} 课堂纪要（{{date}}）',
  '',
  '请基于课堂转写内容生成结构化纪要，输出必须使用中文 Markdown，并包含以下四部分：',
  '1. 核心要点：3-6 条，突出本节课最重要结论。',
  '2. 详细内容（带时间戳）：按主题列点，每条尽量附带 [HH:MM:SS] 时间锚点。',
  '3. 关键术语表：给出术语、简要解释、课堂语境。',
  '4. 复习建议：提供可执行的复习步骤与练习建议。',
  '',
  '时长参考：{{duration}}',
].join('\n');

const SYSTEM_PROMPT = [
  '你是一名严谨的课堂学习助教。',
  '请忠实依据给定转写内容总结，不要虚构事实。',
  '若信息不足，请明确写出“转写中未提及”。',
  '输出使用简洁、清晰、可复习的 Markdown 结构。',
].join('\n');

const MAX_TRANSCRIPT_CHARS = 60_000;

export interface SummaryPrompts {
  systemPrompt: string;
  userPrompt: string;
}

export function buildSummaryPrompts(
  transcription: TranscriptionResult,
  options: SummaryOptions,
): SummaryPrompts {
  const template = resolveTemplate(options.template, options.context);
  const transcriptText = buildTranscriptForPrompt(transcription);

  const userPrompt = [
    '请严格按照以下模板要求输出课堂纪要。',
    '',
    '【模板要求】',
    template,
    '',
    '【课程信息】',
    `课程名称：${options.context.courseName}`,
    `课程日期：${options.context.date}`,
    `课程时长：${options.context.duration}`,
    '',
    '【课堂转写】',
    transcriptText,
  ].join('\n');

  return {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
  };
}

export function resolveTemplate(template: string | undefined, context: SummaryContext): string {
  const rawTemplate = normalizeTemplate(template) || DEFAULT_TEMPLATE;
  return rawTemplate
    .replace(/\{\{courseName\}\}/g, context.courseName)
    .replace(/\{\{date\}\}/g, context.date)
    .replace(/\{\{duration\}\}/g, context.duration);
}

function buildTranscriptForPrompt(transcription: TranscriptionResult): string {
  const fromSegments = buildSegmentTranscript(transcription.segments);
  const fullText = normalizeText(transcription.fullText);
  const base = fromSegments || fullText;

  if (!base) {
    return '（转写为空）';
  }

  if (base.length <= MAX_TRANSCRIPT_CHARS) {
    return base;
  }

  return `${base.slice(0, MAX_TRANSCRIPT_CHARS)}\n\n[提示] 转写文本过长，已截断。`;
}

function buildSegmentTranscript(segments: TranscriptionSegment[] | undefined): string {
  if (!Array.isArray(segments) || segments.length === 0) {
    return '';
  }

  return segments
    .map((segment) => {
      const text = normalizeText(segment.text);
      if (!text) {
        return '';
      }
      const start = formatClock(segment.start);
      return `[${start}] ${text}`;
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

function formatClock(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const total = Math.floor(safe);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function normalizeTemplate(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeText(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}
