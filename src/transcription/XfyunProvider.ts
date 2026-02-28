import { createHash, createHmac } from 'crypto';
import { requestUrl } from 'obsidian';
import type LectureRecorderPlugin from '../main';
import { convertToWav16k } from '../utils/audioUtils';
import { sleep } from '../utils/timeUtils';
import {
  ITranscriptionProvider,
  ProviderValidationResult,
  TranscriptionOptions,
  TranscriptionProgress,
  TranscriptionResult,
  TranscriptionSegment,
} from './types';

type JsonObject = Record<string, unknown>;

interface XfyunApiResponse {
  ok?: number;
  err_no?: number;
  failed?: number;
  message?: string;
  data?: unknown;
}

export class XfyunProvider implements ITranscriptionProvider {
  readonly name = '科大讯飞';
  readonly id = 'xfyun';
  private plugin: LectureRecorderPlugin;
  private readonly apiBaseUrl = 'https://raasr.xfyun.cn/v2/api';

  constructor(plugin: LectureRecorderPlugin) {
    this.plugin = plugin;
  }

  validateConfig(): Promise<ProviderValidationResult> {
    if (!normalizeSettingString(this.plugin.settings.xfyunAppId)) {
      return Promise.resolve({ valid: false, message: '讯飞 App ID 未配置' });
    }
    if (!normalizeSettingString(this.plugin.settings.xfyunSecretKey)) {
      return Promise.resolve({ valid: false, message: '讯飞 Secret key 未配置' });
    }
    return Promise.resolve({ valid: true, message: '配置有效' });
  }

  getSupportedFormats(): string[] {
    return ['wav', 'webm', 'ogg', 'mp3', 'm4a', 'mp4'];
  }

  getMaxFileSize(): number {
    return 500 * 1024 * 1024;
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
      message: '正在转换音频为 16kHz WAV（讯飞要求）',
    });
    const wavBuffer = await convertToWav16k(audioBuffer);

    const fileSize = wavBuffer.byteLength;
    const fileName = options.fileName || `recording-${Date.now()}.wav`;
    const taskId = await this.prepareTask(fileName, fileSize);

    onProgress?.({
      stage: 'upload',
      message: '正在上传音频到讯飞',
      progress: 20,
    });
    await this.uploadSlice(taskId, 'aaaaaa', wavBuffer);

    onProgress?.({
      stage: 'processing',
      message: '正在通知讯飞合并分片',
      progress: 40,
    });
    await this.mergeTask(taskId);

    onProgress?.({
      stage: 'processing',
      message: '讯飞正在识别语音内容',
      progress: 55,
    });
    await this.pollProgress(taskId, onProgress);

    onProgress?.({
      stage: 'download',
      message: '正在获取讯飞识别结果',
      progress: 90,
    });
    const resultData = await this.fetchResult(taskId);

    const parsed = this.parseResultData(resultData);
    onProgress?.({
      stage: 'done',
      progress: 100,
      message: '讯飞转写完成',
    });

    return {
      segments: parsed.segments,
      fullText: parsed.fullText,
      language: options.language && options.language !== 'auto' ? options.language : 'zh',
      duration: parsed.duration,
      providerId: this.id,
      createdAt: new Date().toISOString(),
    };
  }

  private async prepareTask(fileName: string, fileSize: number): Promise<string> {
    const response = await this.request('prepare', {
      file_name: fileName,
      file_len: String(fileSize),
      lang: 'cn',
    });

    const data = normalizeData(response.data);
    const taskId = readStringField(data, ['task_id', 'order_id', 'taskid', 'id']);
    if (!taskId) {
      throw new Error('讯飞 prepare 返回中缺少 task_id');
    }
    return taskId;
  }

  private async uploadSlice(taskId: string, sliceId: string, buffer: ArrayBuffer): Promise<void> {
    await this.request('upload', {
      task_id: taskId,
      slice_id: sliceId,
    }, {
      body: new Blob([buffer], { type: 'audio/wav' }),
    });
  }

  private async mergeTask(taskId: string): Promise<void> {
    await this.request('merge', { task_id: taskId });
  }

  private async pollProgress(
    taskId: string,
    onProgress?: (progress: TranscriptionProgress) => void,
  ): Promise<void> {
    const maxAttempts = 120;
    for (let i = 0; i < maxAttempts; i++) {
      const response = await this.request('getProgress', { task_id: taskId });
      const data = normalizeData(response.data);

      const status = readNumberField(data, ['status', 'task_status']);
      if (status === 9 || status === 5) {
        return;
      }

      const progress = Math.min(89, 55 + Math.floor((i / maxAttempts) * 30));
      onProgress?.({
        stage: 'processing',
        progress,
        message: `讯飞识别中（第 ${i + 1} 次轮询）`,
      });
      await sleep(3000);
    }

    throw new Error('讯飞转写超时，请稍后重试');
  }

  private async fetchResult(taskId: string): Promise<unknown> {
    const response = await this.request('getResult', { task_id: taskId });
    return response.data;
  }

  private async request(
    action: string,
    params: Record<string, string>,
    options?: { body?: Blob },
  ): Promise<XfyunApiResponse> {
    const ts = Math.floor(Date.now() / 1000).toString();
    const signa = this.createSign(ts);
    const query = new URLSearchParams({
      appid: normalizeSettingString(this.plugin.settings.xfyunAppId),
      ts,
      signa,
      ...params,
    });
    const url = `${this.apiBaseUrl}/${action}?${query.toString()}`;

    const requestBody = options?.body ? await options.body.arrayBuffer() : undefined;
    const response = await requestUrl({
      url,
      method: 'POST',
      body: requestBody,
      throw: false,
    });

    if (response.status >= 400) {
      const detail = response.text || '请求失败';
      throw new Error(`讯飞 ${action} 请求失败 (${response.status}): ${detail}`);
    }

    const payload = normalizeXfyunPayload(response.json);
    const code = typeof payload.ok === 'number'
      ? payload.ok
      : (typeof payload.err_no === 'number' ? payload.err_no : 0);
    const failed = typeof payload.failed === 'number' ? payload.failed : 0;
    if (code !== 0 || failed !== 0) {
      throw new Error(`讯飞 ${action} 接口错误: ${payload.message || `code=${code}`}`);
    }

    return payload;
  }

  private createSign(ts: string): string {
    const appId = normalizeSettingString(this.plugin.settings.xfyunAppId);
    const secretKey = normalizeSettingString(this.plugin.settings.xfyunSecretKey);
    const md5 = createHash('md5').update(appId + ts).digest('hex');
    return createHmac('sha1', secretKey).update(md5).digest('base64');
  }

  private parseResultData(raw: unknown): {
    segments: TranscriptionSegment[];
    fullText: string;
    duration: number;
  } {
    const data = normalizeData(raw);
    const segmentTexts: string[] = [];

    collectOnebestTexts(data, segmentTexts);

    let fullText = segmentTexts.join('\n').trim();
    if (!fullText) {
      if (typeof raw === 'string') {
        fullText = extractTextFromRawString(raw);
      } else {
        fullText = JSON.stringify(raw);
      }
    }

    const duration = estimateDurationFromText(fullText);
    const segments: TranscriptionSegment[] = fullText
      ? [{ start: 0, end: duration, text: fullText }]
      : [];

    return {
      segments,
      fullText,
      duration,
    };
  }
}

function normalizeData(data: unknown): JsonObject {
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data) as unknown;
      if (parsed && typeof parsed === 'object') {
        return parsed as JsonObject;
      }
    } catch {
      return { text: data };
    }
    return { text: data };
  }

  if (data && typeof data === 'object') {
    return data as JsonObject;
  }

  return {};
}

function readStringField(data: JsonObject, keys: string[]): string {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function readNumberField(data: JsonObject, keys: string[]): number {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }
  return -1;
}

function collectOnebestTexts(data: JsonObject, out: string[]): void {
  for (const key of Object.keys(data)) {
    const value = data[key];
    if (key === 'onebest' && typeof value === 'string' && value.trim()) {
      out.push(value.trim());
      continue;
    }

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value) as unknown;
        if (parsed && typeof parsed === 'object') {
          collectOnebestTexts(parsed as JsonObject, out);
        }
      } catch {
        // skip non-JSON strings
      }
      continue;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item && typeof item === 'object') {
          collectOnebestTexts(item as JsonObject, out);
        }
      });
      continue;
    }

    if (value && typeof value === 'object') {
      collectOnebestTexts(value as JsonObject, out);
    }
  }
}

function extractTextFromRawString(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object') {
      const texts: string[] = [];
      collectOnebestTexts(parsed as JsonObject, texts);
      if (texts.length > 0) {
        return texts.join('\n').trim();
      }
    }
  } catch {
    // keep raw text
  }
  return raw.trim();
}

function estimateDurationFromText(fullText: string): number {
  if (!fullText) return 0;
  // 粗略估算：每秒 4 字（中文语速）
  return Math.max(1, Math.ceil(fullText.length / 4));
}

function normalizeSettingString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeXfyunPayload(payload: unknown): XfyunApiResponse {
  if (payload && typeof payload === 'object') {
    return payload as XfyunApiResponse;
  }
  throw new Error('讯飞接口返回了无效响应');
}
