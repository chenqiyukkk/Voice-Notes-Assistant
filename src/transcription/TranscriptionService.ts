import type LectureRecorderPlugin from '../main';
import { LocalWhisperProvider } from './LocalWhisperProvider';
import { TranscriptionCache } from './TranscriptionCache';
import { WhisperProvider } from './WhisperProvider';
import { XfyunProvider } from './XfyunProvider';
import {
  ITranscriptionProvider,
  TranscriptionProgress,
  TranscriptionResult,
} from './types';

export interface TranscriptionRunResult {
  result: TranscriptionResult;
  transcriptPath: string;
  fromCache: boolean;
}

type ProviderId = 'whisper' | 'xfyun' | 'local-whisper';

export class TranscriptionService {
  private plugin: LectureRecorderPlugin;
  private cache: TranscriptionCache;
  private providers = new Map<ProviderId, ITranscriptionProvider>();

  constructor(plugin: LectureRecorderPlugin) {
    this.plugin = plugin;
    this.cache = new TranscriptionCache(plugin);
    this.registerProvider(new WhisperProvider(plugin));
    this.registerProvider(new XfyunProvider(plugin));
    this.registerProvider(new LocalWhisperProvider(plugin));
  }

  async transcribeFile(
    filePath: string,
    onProgress?: (progress: TranscriptionProgress) => void,
  ): Promise<TranscriptionRunResult> {
    const cached = await this.cache.load(filePath);
    if (cached) {
      const cachedHasContent = Boolean(cached.fullText?.trim()) || cached.segments.length > 0;
      if (cachedHasContent) {
        onProgress?.({
          stage: 'done',
          progress: 100,
          message: '已命中转写缓存，直接返回结果',
        });
        return {
          result: cached,
          transcriptPath: this.cache.getTranscriptPath(filePath),
          fromCache: true,
        };
      }

      onProgress?.({
        stage: 'prepare',
        progress: 2,
        message: '检测到空转写缓存，已自动重新转写',
      });
    }

    const provider = this.getCurrentProvider();
    const validation = await provider.validateConfig();
    if (!validation.valid) {
      throw new Error(validation.message);
    }

    onProgress?.({
      stage: 'prepare',
      progress: 5,
      message: `正在读取音频文件并准备调用 ${provider.name}`,
    });

    const audioBuffer = await this.plugin.audioFileManager.readBinary(filePath);
    const mimeType = guessMimeType(filePath);
    const fileName = filePath.split('/').pop() || `recording-${Date.now()}.webm`;
    const language = this.plugin.settings.transcriptionLanguage || 'auto';

    const result = await provider.transcribe(
      audioBuffer,
      { fileName, mimeType, language },
      onProgress,
    );

    const transcriptPath = await this.cache.save(filePath, result);
    onProgress?.({
      stage: 'done',
      progress: 100,
      message: `转写结果已保存到 ${transcriptPath}`,
    });

    return {
      result,
      transcriptPath,
      fromCache: false,
    };
  }

  getTranscriptPath(filePath: string): string {
    return this.cache.getTranscriptPath(filePath);
  }

  async getCachedTranscription(filePath: string): Promise<TranscriptionResult | null> {
    return await this.cache.load(filePath);
  }

  private registerProvider(provider: ITranscriptionProvider): void {
    this.providers.set(provider.id as ProviderId, provider);
  }

  private getCurrentProvider(): ITranscriptionProvider {
    const providerId = this.plugin.settings.transcriptionProvider as ProviderId;
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`未找到转写 Provider: ${providerId}`);
    }
    return provider;
  }
}

function guessMimeType(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop() || '';
  switch (ext) {
    case 'wav':
      return 'audio/wav';
    case 'ogg':
      return 'audio/ogg';
    case 'mp3':
      return 'audio/mpeg';
    case 'm4a':
      return 'audio/mp4';
    case 'mp4':
      return 'audio/mp4';
    default:
      return 'audio/webm';
  }
}
