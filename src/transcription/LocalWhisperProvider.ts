import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import type LectureRecorderPlugin from '../main';
import { convertToWav16k } from '../utils/audioUtils';
import {
  ITranscriptionProvider,
  ProviderValidationResult,
  TranscriptionOptions,
  TranscriptionProgress,
  TranscriptionResult,
  TranscriptionSegment,
} from './types';

const execFileAsync = promisify(execFile);

interface WhisperCppJsonSegment {
  text?: string;
  start?: number;
  end?: number;
  offsets?: {
    from?: number;
    to?: number;
  };
  timestamps?: {
    from?: string;
    to?: string;
  };
}

interface WhisperCppJsonPayload {
  language?: string;
  transcription?: string | WhisperCppJsonSegment[];
  text?: string;
  segments?: WhisperCppJsonSegment[];
  result?: WhisperCppJsonSegment[] | {
    language?: string;
    text?: string;
    transcription?: WhisperCppJsonSegment[] | string;
    segments?: WhisperCppJsonSegment[];
  };
}

export class LocalWhisperProvider implements ITranscriptionProvider {
  readonly name = 'Local Whisper.cpp';
  readonly id = 'local-whisper';
  private plugin: LectureRecorderPlugin;

  constructor(plugin: LectureRecorderPlugin) {
    this.plugin = plugin;
  }

  async validateConfig(): Promise<ProviderValidationResult> {
    const exePath = normalizeSettingString(this.plugin.settings.whisperCppPath);
    const modelPath = normalizeSettingString(this.plugin.settings.whisperModelPath);

    if (!exePath) {
      return { valid: false, message: 'whisper.cpp 可执行文件路径未配置' };
    }
    if (!modelPath) {
      return { valid: false, message: 'whisper.cpp 模型路径未配置' };
    }

    try {
      await fs.access(exePath);
    } catch {
      return { valid: false, message: `whisper.cpp 可执行文件不存在: ${exePath}` };
    }

    try {
      await fs.access(modelPath);
    } catch {
      return { valid: false, message: `whisper.cpp 模型文件不存在: ${modelPath}` };
    }

    return { valid: true, message: '配置有效' };
  }

  getSupportedFormats(): string[] {
    return ['wav', 'webm', 'ogg', 'mp3', 'm4a', 'mp4'];
  }

  getMaxFileSize(): number {
    return Number.MAX_SAFE_INTEGER;
  }

  async transcribe(
    audioBuffer: ArrayBuffer,
    options: TranscriptionOptions,
    onProgress?: (progress: TranscriptionProgress) => void,
  ): Promise<TranscriptionResult> {
    const validation = await this.validateConfig();
    if (!validation.valid) {
      throw new Error(validation.message);
    }

    onProgress?.({
      stage: 'convert',
      message: '正在转换音频为 16kHz WAV',
    });
    const wavBuffer = await convertToWav16k(audioBuffer);

    const tempDir = path.join(os.tmpdir(), 'lecture-recorder');
    await fs.mkdir(tempDir, { recursive: true });

    const token = `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
    const wavPath = path.join(tempDir, `whisper-input-${token}.wav`);
    const outputBase = path.join(tempDir, `whisper-output-${token}`);
    const outputJsonPath = `${outputBase}.json`;
    const outputTxtPath = `${outputBase}.txt`;

    await fs.writeFile(wavPath, new Uint8Array(wavBuffer));

    const args = [
      '-f', wavPath,
      '-m', normalizeSettingString(this.plugin.settings.whisperModelPath),
      '-oj',
      '-of', outputBase,
      '-t', String(Math.max(1, this.plugin.settings.whisperThreads || 1)),
    ];
    const language = options.language || this.plugin.settings.transcriptionLanguage;
    if (language && language !== 'auto') {
      args.push('-l', language);
    }

    try {
      onProgress?.({
        stage: 'processing',
        message: '本地 whisper.cpp 转写中，请稍候',
      });

      await execFileAsync(normalizeSettingString(this.plugin.settings.whisperCppPath), args, {
        timeout: 600_000,
        windowsHide: true,
        maxBuffer: 50 * 1024 * 1024,
      });

      onProgress?.({
        stage: 'download',
        message: '正在读取 whisper.cpp 输出结果',
      });

      const payload = await this.readWhisperOutput(outputJsonPath, wavPath);
      const parsed = this.parseResult(payload);

      if (!parsed.fullText.trim()) {
        const txtFallback = await readTextIfExists(outputTxtPath);
        if (txtFallback) {
          parsed.fullText = txtFallback;
          if (parsed.segments.length === 0) {
            const estimatedDuration = Math.max(1, Math.ceil(txtFallback.length / 4));
            parsed.duration = estimatedDuration;
            parsed.segments = [{
              start: 0,
              end: estimatedDuration,
              text: txtFallback,
            }];
          }
        }
      }

      if (!parsed.fullText.trim()) {
        throw new Error('whisper.cpp 未返回可用文本，请检查模型或音频内容');
      }

      onProgress?.({
        stage: 'done',
        progress: 100,
        message: '本地 whisper.cpp 转写完成',
      });

      return {
        segments: parsed.segments,
        fullText: parsed.fullText,
        language: parsed.language || (language && language !== 'auto' ? language : 'unknown'),
        duration: parsed.duration,
        providerId: this.id,
        createdAt: new Date().toISOString(),
      };
    } finally {
      await safeUnlink(wavPath);
      await safeUnlink(outputJsonPath);
      await safeUnlink(outputTxtPath);
      await safeUnlink(`${outputBase}.srt`);
      await safeUnlink(`${outputBase}.vtt`);
    }
  }

  private async readWhisperOutput(outputJsonPath: string, wavPath: string): Promise<WhisperCppJsonPayload> {
    const candidates = [outputJsonPath, `${wavPath}.json`];
    for (const filePath of candidates) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content) as WhisperCppJsonPayload;
      } catch {
        // try next path
      }
    }
    throw new Error('未找到 whisper.cpp 输出 JSON，请确认 whisper-cli 参数兼容');
  }

  private parseResult(payload: WhisperCppJsonPayload): {
    segments: TranscriptionSegment[];
    fullText: string;
    duration: number;
    language: string;
  } {
    const rawSegments = this.extractRawSegments(payload);

    const segments: TranscriptionSegment[] = [];
    for (const seg of rawSegments) {
      const text = typeof seg.text === 'string' ? seg.text.trim() : '';
      if (!text) continue;

      let start = 0;
      let end = 0;

      if (typeof seg.start === 'number' && typeof seg.end === 'number') {
        start = seg.start;
        end = seg.end;
      } else if (seg.offsets && typeof seg.offsets.from === 'number' && typeof seg.offsets.to === 'number') {
        start = seg.offsets.from / 1000;
        end = seg.offsets.to / 1000;
      } else if (seg.timestamps) {
        start = parseWhisperTimestamp(seg.timestamps.from);
        end = parseWhisperTimestamp(seg.timestamps.to);
      }

      segments.push({
        start,
        end: Math.max(start, end),
        text,
      });
    }

    const resultObject = this.toResultObject(payload.result);
    const fallbackText = normalizeTextValue(payload.transcription)
      || normalizeTextValue(payload.text)
      || normalizeTextValue(resultObject?.text)
      || normalizeTextValue(resultObject?.transcription);
    const fullText = segments.length > 0
      ? segments.map(seg => seg.text).join(' ').trim()
      : fallbackText;
    const duration = segments.length > 0
      ? segments[segments.length - 1].end
      : 0;
    const language = normalizeTextValue(payload.language) || normalizeTextValue(resultObject?.language);

    return {
      segments,
      fullText,
      duration,
      language,
    };
  }

  private extractRawSegments(payload: WhisperCppJsonPayload): WhisperCppJsonSegment[] {
    if (Array.isArray(payload.segments)) {
      return payload.segments;
    }

    if (Array.isArray(payload.transcription)) {
      return payload.transcription;
    }

    if (Array.isArray(payload.result)) {
      return payload.result;
    }

    const resultObject = this.toResultObject(payload.result);
    if (resultObject) {
      if (Array.isArray(resultObject.segments)) {
        return resultObject.segments;
      }
      if (Array.isArray(resultObject.transcription)) {
        return resultObject.transcription;
      }
    }

    return [];
  }

  private toResultObject(
    value: WhisperCppJsonPayload['result'],
  ): {
    language?: string;
    text?: string;
    transcription?: WhisperCppJsonSegment[] | string;
    segments?: WhisperCppJsonSegment[];
  } | null {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      return null;
    }
    return value;
  }
}

function parseWhisperTimestamp(value?: string): number {
  if (!value) return 0;
  const trimmed = value.trim().replace(',', '.');
  const parts = trimmed.split(':').map(v => Number(v));
  if (parts.some(Number.isNaN)) return 0;

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return 0;
}

async function safeUnlink(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch {
    // ignore
  }
}

async function readTextIfExists(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content.trim();
  } catch {
    return '';
  }
}

function normalizeSettingString(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith('\'') && trimmed.endsWith('\''))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function normalizeTextValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }

  if (Array.isArray(value)) {
    if (
      value.every(item => item && typeof item === 'object' && 'text' in (item as Record<string, unknown>))
    ) {
      return (value as Array<Record<string, unknown>>)
        .map(item => normalizeTextValue(item.text))
        .filter(Boolean)
        .join(' ')
        .trim();
    }

    return value
      .map(item => normalizeTextValue(item))
      .filter(Boolean)
      .join(' ')
      .trim();
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('text' in obj) {
      return normalizeTextValue(obj.text);
    }
    if ('transcription' in obj) {
      return normalizeTextValue(obj.transcription);
    }
    if ('segments' in obj) {
      return normalizeTextValue(obj.segments);
    }
    return '';
  }

  return '';
}
