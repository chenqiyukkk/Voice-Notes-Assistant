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

  async validateConfig(): Promise<ProviderValidationResult> {
    if (!normalizeSettingString(this.plugin.settings.whisperApiKey)) {
      return { valid: false, message: 'Whisper API Key 未配置' };
    }
    if (!normalizeSettingString(this.plugin.settings.whisperApiBaseUrl)) {
      return { valid: false, message: 'Whisper API Base URL 未配置' };
    }
    return { valid: true, message: '配置有效' };
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

    const formData = new FormData();
    formData.append(
      'file',
      new Blob([audioBuffer], { type: mimeType }),
      options.fileName || `audio.${mimeExtension(mimeType)}`,
    );
    formData.append('model', this.plugin.settings.whisperModel || 'whisper-1');
    formData.append('response_format', 'verbose_json');

    const language = options.language || this.plugin.settings.transcriptionLanguage;
    if (language && language !== 'auto') {
      formData.append('language', language);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Whisper API 请求失败 (${response.status}): ${detail || response.statusText}`);
    }

    return await response.json() as WhisperResponsePayload;
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
