import { Notice } from 'obsidian';
import type LectureRecorderPlugin from '../main';
import { convertToWav16k } from '../utils/audioUtils';
import { AUDIO_BITRATES, SUPPORTED_MIME_TYPES } from '../utils/constants';
import { formatDuration } from '../utils/timeUtils';

export enum RecorderState {
  IDLE = 'idle',
  RECORDING = 'recording',
  PAUSED = 'paused',
}

export class AudioRecorder {
  private plugin: LectureRecorderPlugin;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private state: RecorderState = RecorderState.IDLE;
  private startTime = 0;
  private pausedDuration = 0;
  private pauseStart = 0;
  private stream: MediaStream | null = null;
  private stateListeners = new Set<(state: RecorderState) => void>();
  private stopPromise: Promise<{ filePath: string; duration: number }> | null = null;

  onStateChange: ((state: RecorderState) => void) | null = null;

  constructor(plugin: LectureRecorderPlugin) {
    this.plugin = plugin;
  }

  getState(): RecorderState {
    return this.state;
  }

  isRecording(): boolean {
    return this.state === RecorderState.RECORDING;
  }

  isPaused(): boolean {
    return this.state === RecorderState.PAUSED;
  }

  isIdle(): boolean {
    return this.state === RecorderState.IDLE;
  }

  addStateListener(listener: (state: RecorderState) => void): void {
    this.stateListeners.add(listener);
  }

  removeStateListener(listener: (state: RecorderState) => void): void {
    this.stateListeners.delete(listener);
  }

  /**
   * 获取当前录音时长（毫秒），排除暂停时间
   */
  getElapsedTime(): number {
    if (this.state === RecorderState.IDLE) return 0;
    const pauseOffset = this.state === RecorderState.PAUSED
      ? (Date.now() - this.pauseStart)
      : 0;
    return Date.now() - this.startTime - this.pausedDuration - pauseOffset;
  }

  /**
   * 切换录音状态（开始/停止）
   */
  async toggle(): Promise<{ filePath: string; duration: number } | null> {
    if (this.state === RecorderState.IDLE) {
      await this.start();
      return null;
    } else {
      return await this.stop();
    }
  }

  /**
   * 切换暂停状态
   */
  pauseResume(): void {
    if (this.state === RecorderState.RECORDING) {
      this.pause();
    } else if (this.state === RecorderState.PAUSED) {
      this.resume();
    }
  }

  /**
   * 开始录音
   */
  async start(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });
    } catch (err) {
      new Notice('无法访问麦克风，请检查权限设置');
      console.error('Lecture Recorder: 麦克风权限错误', err);
      return;
    }

    const mimeType = this.getSupportedMimeType();
    if (this.plugin.settings.audioFormat === 'wav' && !mimeType.includes('wav')) {
      new Notice('当前环境不支持直接 wav 录制，已启用“录制后自动转 wav 保存”');
    }
    const bitrate = AUDIO_BITRATES[this.plugin.settings.audioQuality] || AUDIO_BITRATES.standard;

    try {
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: mimeType || undefined,
        audioBitsPerSecond: bitrate,
      });
    } catch (err) {
      // fallback: 不指定 mimeType
      this.mediaRecorder = new MediaRecorder(this.stream, {
        audioBitsPerSecond: bitrate,
      });
    }

    this.audioChunks = [];

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    // 每 10 秒采集一次数据，防止长录音内存问题
    this.mediaRecorder.start(10000);
    this.startTime = Date.now();
    this.pausedDuration = 0;
    this.setState(RecorderState.RECORDING);

    new Notice('开始录音');
  }

  /**
   * 暂停录音
   */
  pause(): void {
    if (this.state !== RecorderState.RECORDING || !this.mediaRecorder) return;
    this.mediaRecorder.pause();
    this.pauseStart = Date.now();
    this.setState(RecorderState.PAUSED);
    new Notice('录音已暂停');
  }

  /**
   * 继续录音
   */
  resume(): void {
    if (this.state !== RecorderState.PAUSED || !this.mediaRecorder) return;
    this.mediaRecorder.resume();
    this.pausedDuration += Date.now() - this.pauseStart;
    this.setState(RecorderState.RECORDING);
    new Notice('录音已继续');
  }

  /**
   * 停止录音并保存文件
   * @returns 保存的文件路径和录音时长
   */
  async stop(): Promise<{ filePath: string; duration: number }> {
    if (this.stopPromise) {
      return await this.stopPromise;
    }

    this.stopPromise = new Promise<{ filePath: string; duration: number }>((resolve) => {
      if (!this.mediaRecorder || this.state === RecorderState.IDLE) {
        resolve({ filePath: '', duration: 0 });
        return;
      }

      const recorder = this.mediaRecorder;
      // 在 cleanup 之前记录 duration，防止 state 变为 IDLE 后返回 0
      const duration = this.getElapsedTime();

      recorder.onstop = async () => {
        try {
          const filePath = await this.saveRecording();
          new Notice(`录音已保存: ${filePath} (${formatDuration(duration)})`);
          this.cleanup();
          resolve({ filePath, duration });
        } catch (err) {
          new Notice(`录音保存失败: ${err}`);
          console.error('Lecture Recorder: 保存失败', err);
          this.cleanup();
          resolve({ filePath: '', duration: 0 });
        }
      };

      try {
        recorder.requestData();
      } catch {
        // 某些状态下 requestData 可能抛异常，不影响 stop 流程
      }

      if (recorder.state !== 'inactive') {
        recorder.stop();
      } else {
        // 极端情况下 recorder 已 inactive，仍按失败路径收敛
        this.cleanup();
        resolve({ filePath: '', duration: 0 });
      }
    }).finally(() => {
      this.stopPromise = null;
    });

    return await this.stopPromise;
  }

  /**
   * 保存录音文件到 Vault
   */
  private async saveRecording(): Promise<string> {
    if (this.audioChunks.length === 0) {
      throw new Error('录音数据为空，可能因过快停止或设备异常导致');
    }

    const sourceMimeType = this.audioChunks[0]?.type || 'audio/webm';
    const blob = new Blob(this.audioChunks, { type: sourceMimeType });
    const sourceArrayBuffer = await blob.arrayBuffer();

    let outputArrayBuffer = sourceArrayBuffer;
    let outputMimeType = sourceMimeType;
    if (this.plugin.settings.audioFormat === 'wav' && !sourceMimeType.includes('wav')) {
      try {
        outputArrayBuffer = await convertToWav16k(sourceArrayBuffer);
        outputMimeType = 'audio/wav';
      } catch (err) {
        console.warn('Lecture Recorder: WAV 转码失败，已回退原始格式', err);
        new Notice('wav 转码失败，已回退原始格式保存');
      }
    }

    const storagePath = this.plugin.settings.recordingStoragePath;
    const baseFileName = this.generateFileName(outputMimeType);
    const fullPath = await this.resolveUniquePath(storagePath, baseFileName);

    // 确保目录存在
    await this.ensureDirectoryExists(storagePath);

    // 使用 Obsidian Vault API 保存文件
    await this.plugin.app.vault.createBinary(fullPath, new Uint8Array(outputArrayBuffer));

    return fullPath;
  }

  /**
   * 确保目录存在，不存在则创建
   */
  private async ensureDirectoryExists(path: string): Promise<void> {
    const adapter = this.plugin.app.vault.adapter;
    const exists = await adapter.exists(path);
    if (!exists) {
      await adapter.mkdir(path);
    }
  }

  /**
   * 生成录音文件名
   */
  private generateFileName(mimeType: string): string {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
    const ms = now.getMilliseconds().toString().padStart(3, '0');
    const ext = this.resolveExtensionFromMimeType(mimeType);
    return `recording-${date}-${time}-${ms}.${ext}`;
  }

  private resolveExtensionFromMimeType(mimeType: string): string {
    const type = (mimeType || '').toLowerCase();
    if (type.includes('ogg')) return 'ogg';
    if (type.includes('wav') || type.includes('wave')) return 'wav';
    if (type.includes('mp4') || type.includes('m4a')) return 'm4a';
    if (type.includes('mpeg') || type.includes('mp3')) return 'mp3';
    if (type.includes('webm')) return 'webm';
    return 'webm';
  }

  /**
   * 防止重名覆盖：若文件已存在则自动追加序号
   */
  private async resolveUniquePath(storagePath: string, fileName: string): Promise<string> {
    const dotIndex = fileName.lastIndexOf('.');
    const name = dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName;
    const ext = dotIndex >= 0 ? fileName.slice(dotIndex) : '';

    const adapter = this.plugin.app.vault.adapter;
    let candidate = `${storagePath}/${fileName}`;
    let index = 1;

    while (await adapter.exists(candidate)) {
      candidate = `${storagePath}/${name}-${index}${ext}`;
      index += 1;
    }

    return candidate;
  }

  /**
   * 获取浏览器支持的 mimeType
   */
  private getSupportedMimeType(): string {
    const preferred = this.plugin.settings.audioFormat === 'wav'
      ? ['audio/wav', ...SUPPORTED_MIME_TYPES.filter(type => type !== 'audio/wav')]
      : SUPPORTED_MIME_TYPES;

    for (const type of preferred) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
  }

  private setState(state: RecorderState): void {
    this.state = state;
    this.onStateChange?.(state);
    this.stateListeners.forEach(listener => listener(state));
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.setState(RecorderState.IDLE);
  }
}
