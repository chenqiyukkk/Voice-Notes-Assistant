import { requestUrl } from 'obsidian';
import type LectureRecorderPlugin from '../main';
import { convertToWav16k, splitAudioBuffer } from '../utils/audioUtils';
import {
  ITranscriptionProvider,
  ProviderValidationResult,
  TranscriptionOptions,
  TranscriptionProgress,
  TranscriptionResult,
  TranscriptionSegment,
} from './types';

interface WhisperResponseSegment {
  start?: number;
  end?: number;
  text?: string;
}

interface WhisperResponsePayload {
  text?: string;
  language?: string;
  duration?: number;
  segments?: WhisperResponseSegment[];
}

const WHISPER_MAX_FILE_SIZE = 25 * 1024 * 1024;

export class WhisperProvider implements ITranscriptionProvider {
  readonly name = 'OpenAI Whisper';
  readonly id = 'whisper';
  private plugin: LectureRecorderPlugin;

  constructor(plugin: LectureRecorderPlugin) {
    this.plugin = plugin;
  }

  validateConfig(): Promise<ProviderValidationResult> {
    if (!normalizeSettingString(this.plugin.settings.whisperApiKey)) {
      return Promise.resolve({ valid: false, message: 'Whisper API key 未配置' });
    }
    if (!normalizeSettingString(this.plugin.settings.whisperApiBaseUrl)) {
      return Promise.resolve({ valid: false, message: 'Whisper API base URL 未配置' });
    }
    return Promise.resolve({ valid: true, message: '配置有效' });
  }

  getSupportedFormats(): string[] {
    return ['webm', 'wav', 'ogg', 'mp3', 'mp4', 'mpeg', 'mpga', 'm4a'];
  }

  getMaxFileSize(): number {
    return WHISPER_MAX_FILE_SIZE;
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

    let chunks: ArrayBuffer[] = [audioBuffer];
    let uploadMimeType = options.mimeType || 'audio/webm';

    if (audioBuffer.byteLength > this.getMaxFileSize()) {
      onProgress?.({
        stage: 'convert',
        message: '音频较大，正在转码为 16kHz WAV 并分片上传',
      });
      const wav16k = await convertToWav16k(audioBuffer);
      chunks = splitAudioBuffer(wav16k, this.getMaxFileSize() - 512 * 1024);
      uploadMimeType = 'audio/wav';
    }

    const mergedSegments: TranscriptionSegment[] = [];
    const fullTextParts: string[] = [];
    let accumulatedOffset = 0;
    let detectedLanguage = options.language && options.language !== 'auto'
      ? options.language
      : 'unknown';

    for (let i = 0; i < chunks.length; i++) {
      const progressBase = chunks.length > 1 ? Math.floor((i / chunks.length) * 100) : 0;
      onProgress?.({
        stage: 'upload',
        progress: progressBase,
        message: chunks.length > 1
          ? `Whisper 分片上传中 (${i + 1}/${chunks.length})`
          : '正在上传音频到 Whisper',
      });

      const payload = await this.requestWhisper(chunks[i], {
        ...options,
        mimeType: uploadMimeType,
        fileName: chunks.length > 1
          ? `chunk-${i + 1}.${mimeExtension(uploadMimeType)}`
          : options.fileName,
      });

      const segments = this.extractSegments(payload, accumulatedOffset);
      if (segments.length > 0) {
        mergedSegments.push(...segments);
        const chunkDuration = segments[segments.length - 1].end - accumulatedOffset;
        accumulatedOffset += Math.max(0, chunkDuration);
      } else if (typeof payload.duration === 'number' && payload.duration > 0) {
        accumulatedOffset += payload.duration;
      }

      if (typeof payload.text === 'string' && payload.text.trim()) {
        fullTextParts.push(payload.text.trim());
      } else if (segments.length > 0) {
        fullTextParts.push(segments.map(seg => seg.text).join(' ').trim());
      }

      if (typeof payload.language === 'string' && payload.language.trim()) {
        detectedLanguage = payload.language.trim();
      }
    }

    const duration = mergedSegments.length > 0
      ? mergedSegments[mergedSegments.length - 1].end
      : accumulatedOffset;

    onProgress?.({
      stage: 'done',
      progress: 100,
      message: 'Whisper 转写完成',
    });

    return {
      segments: mergedSegments,
      fullText: fullTextParts.join('\n').trim(),
      language: detectedLanguage || 'unknown',
      duration,
      providerId: this.id,
      createdAt: new Date().toISOString(),
    };
  }

  private async requestWhisper(
    audioBuffer: ArrayBuffer,
    options: TranscriptionOptions,
  ): Promise<WhisperResponsePayload> {
    const baseUrl = normalizeSettingString(this.plugin.settings.whisperApiBaseUrl).replace(/\/+$/, '');
    const url = `${baseUrl}/audio/transcriptions`;
    const apiKey = normalizeSettingString(this.plugin.settings.whisperApiKey);
    const mimeType = options.mimeType || 'audio/webm';

    const language = options.language || this.plugin.settings.transcriptionLanguage;
    const boundary = `----LectureRecorderBoundary${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
    const body = buildMultipartFormData([
      {
        name: 'file',
        fileName: options.fileName || `audio.${mimeExtension(mimeType)}`,
        contentType: mimeType,
        data: audioBuffer,
      },
      {
        name: 'model',
        data: this.plugin.settings.whisperModel || 'whisper-1',
      },
      {
        name: 'response_format',
        data: 'verbose_json',
      },
      ...(language && language !== 'auto'
        ? [{ name: 'language', data: language }]
        : []),
    ], boundary);

    const response = await requestUrl({
      url,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
      throw: false,
    });

    if (response.status >= 400) {
      const detail = response.text || '请求失败';
      throw new Error(`Whisper API 请求失败 (${response.status}): ${detail}`);
    }

    return normalizeWhisperPayload(response.json);
  }

  private extractSegments(payload: WhisperResponsePayload, offset: number): TranscriptionSegment[] {
    const rawSegments = Array.isArray(payload.segments) ? payload.segments : [];
    const segments: TranscriptionSegment[] = [];

    for (const seg of rawSegments) {
      const start = typeof seg.start === 'number' ? seg.start + offset : offset;
      const end = typeof seg.end === 'number' ? seg.end + offset : start;
      const text = typeof seg.text === 'string' ? seg.text.trim() : '';
      if (!text) continue;
      segments.push({
        start,
        end: Math.max(start, end),
        text,
      });
    }

    if (segments.length === 0 && typeof payload.text === 'string' && payload.text.trim()) {
      const fallbackDuration = typeof payload.duration === 'number' && payload.duration > 0
        ? payload.duration
        : 0;
      segments.push({
        start: offset,
        end: offset + fallbackDuration,
        text: payload.text.trim(),
      });
    }

    return segments;
  }
}

function mimeExtension(mimeType: string): string {
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  return 'webm';
}

function normalizeSettingString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

interface MultipartPart {
  name: string;
  data: string | ArrayBuffer;
  fileName?: string;
  contentType?: string;
}

function buildMultipartFormData(parts: MultipartPart[], boundary: string): ArrayBuffer {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];

  for (const part of parts) {
    chunks.push(encoder.encode(`--${boundary}\r\n`));
    if (part.fileName) {
      chunks.push(encoder.encode(
        `Content-Disposition: form-data; name="${part.name}"; filename="${part.fileName}"\r\n`,
      ));
      chunks.push(encoder.encode(`Content-Type: ${part.contentType || 'application/octet-stream'}\r\n\r\n`));
      chunks.push(typeof part.data === 'string' ? encoder.encode(part.data) : new Uint8Array(part.data));
      chunks.push(encoder.encode('\r\n'));
      continue;
    }

    chunks.push(encoder.encode(`Content-Disposition: form-data; name="${part.name}"\r\n\r\n`));
    chunks.push(encoder.encode(typeof part.data === 'string' ? part.data : ''));
    chunks.push(encoder.encode('\r\n'));
  }

  chunks.push(encoder.encode(`--${boundary}--\r\n`));

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output.buffer;
}

function normalizeWhisperPayload(payload: unknown): WhisperResponsePayload {
  if (payload && typeof payload === 'object') {
    return payload as WhisperResponsePayload;
  }
  throw new Error('Whisper API 返回了无效响应');
}
