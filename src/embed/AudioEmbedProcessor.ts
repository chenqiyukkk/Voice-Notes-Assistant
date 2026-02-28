import { MarkdownPostProcessorContext, MarkdownRenderChild, TFile } from 'obsidian';
import type LectureRecorderPlugin from '../main';
import type { TranscriptionResult } from '../transcription/types';
import { formatTime } from '../utils/timeUtils';
import { attachWaveform } from '../utils/waveform';
import { i18n } from '../i18n';

interface AudioEmbedParams {
  file: string;
  title: string;
  duration: string;
  status?: string;
  id?: string;
  transcription?: string;
}

interface ResultPanel {
  detailsEl: HTMLDetailsElement;
  summaryEl: HTMLElement;
  contentEl: HTMLElement;
}

export class AudioEmbedProcessor {
  private plugin: LectureRecorderPlugin;

  /** 当前活跃的 Audio 元素（用于时间戳跳转） */
  private static activeAudio: HTMLAudioElement | null = null;
  private static activeFilePath: string | null = null;

  constructor(plugin: LectureRecorderPlugin) {
    this.plugin = plugin;
  }

  /**
   * 注册代码块处理器
   */
  register(): void {
    this.plugin.registerMarkdownCodeBlockProcessor(
      'lecture-audio',
      (source, el, ctx) => this.render(source, el, ctx),
    );
  }

  /**
   * 获取当前活跃的播放器（供 TimestampManager 使用）
   */
  static getActiveAudio(): HTMLAudioElement | null {
    return AudioEmbedProcessor.activeAudio;
  }

  static getActiveFilePath(): string | null {
    return AudioEmbedProcessor.activeFilePath;
  }

  /**
   * 设置活跃播放器（供 LivePreviewExtension 调用）
   */
  static setActiveAudio(audio: HTMLAudioElement, filePath: string): void {
    AudioEmbedProcessor.activeAudio = audio;
    AudioEmbedProcessor.activeFilePath = filePath;
  }

  /**
   * 渲染 lecture-audio 代码块为音频播放器
   */
  private render(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
  ): void {
    const params = this.parseParams(source);

    if (params.status === 'recording') {
      const placeholderEl = el.createEl('div', { cls: 'lecture-recording-reading-placeholder' });
      placeholderEl.createEl('div', {
        cls: 'recording-reading-title',
        text: this.t('player.reading.title', {
          title: params.title || this.t('recording.title.fallback'),
        }),
      });
      placeholderEl.createEl('div', {
        cls: 'recording-reading-tip',
        text: this.t('player.reading.tip'),
      });
      return;
    }

    if (!params.file) {
      el.createEl('div', { cls: 'player-error', text: this.t('player.error.missingPath') });
      return;
    }

    // 获取音频文件
    const audioFile = this.plugin.app.vault.getAbstractFileByPath(params.file);
    if (!audioFile || !(audioFile instanceof TFile)) {
      el.createEl('div', {
        cls: 'player-error',
        text: this.t('player.error.fileNotFound', { file: params.file }),
      });
      return;
    }

    const audioUrl = this.plugin.app.vault.getResourcePath(audioFile);
    // 关键修复：不在渲染时预加载音频，避免大文件 IO 阻塞笔记打开
    const audio = new Audio();
    audio.preload = 'none';
    let fallbackUrl: string | null = null;
    let fallbackAttempted = false;
    let destroyed = false;

    const onAudioError = () => {
      if (fallbackAttempted || destroyed) {
        return;
      }
      fallbackAttempted = true;
      void this.tryRecoverAudioSource(audioFile, audio, (url) => {
        fallbackUrl = url;
      }, false, () => destroyed);
    };
    audio.addEventListener('error', onAudioError);
    // 延迟设置 src，避免在渲染过程中触发大文件加载
    window.setTimeout(() => {
      if (!destroyed) {
        audio.src = audioUrl;
      }
    }, 0);

    // 创建播放器
    const playerEl = el.createEl('div', { cls: 'lecture-audio-player' });
    const cleanupPlayer = this.buildPlayer(playerEl, audio, audioUrl, params, ctx.sourcePath);

    // 标记为活跃播放器
    AudioEmbedProcessor.activeAudio = audio;
    AudioEmbedProcessor.activeFilePath = params.file;

    // 使用正确的 MarkdownRenderChild 管理生命周期
    const renderChild = new MarkdownRenderChild(playerEl);
    renderChild.onunload = () => {
      destroyed = true;
      cleanupPlayer();
      audio.pause();
      audio.removeAttribute('src');
      audio.load(); // 释放内部资源
      audio.removeEventListener('error', onAudioError);
      if (fallbackUrl) {
        URL.revokeObjectURL(fallbackUrl);
        fallbackUrl = null;
      }
      if (AudioEmbedProcessor.activeAudio === audio) {
        AudioEmbedProcessor.activeAudio = null;
        AudioEmbedProcessor.activeFilePath = null;
      }
    };
    ctx.addChild(renderChild);
  }

  /**
   * 构建播放器 UI
   */
  private buildPlayer(
    container: HTMLElement,
    audio: HTMLAudioElement,
    audioUrl: string,
    params: AudioEmbedParams,
    sourcePath?: string,
  ): () => void {
    let destroyed = false;

    // 标题栏
    const headerEl = container.createEl('div', { cls: 'player-header' });
    headerEl.createEl('span', {
      cls: 'player-icon',
      text: '🎙',
    });
    headerEl.createEl('span', {
      cls: 'player-title',
      text: params.title || this.t('player.title.fallback'),
    });
    headerEl.createEl('span', {
      cls: 'player-duration-badge',
      text: params.duration || '--:--:--',
    });
    const transcriptPanel = this.createTranscriptPanel(container);
    const summaryPanel = this.createSummaryPanel(container);
    void this.refreshTranscriptPanel(params.file, transcriptPanel);
    void this.refreshSummaryPanel(params.file, summaryPanel);
    const waveformCleanup = this.plugin.settings.waveformEnabled
      ? attachWaveform({
        hostEl: container,
        audio,
        filePath: params.file,
        readBinary: (filePath: string) => this.plugin.audioFileManager.readBinary(filePath),
        maxFileSizeMB: this.plugin.settings.waveformMaxFileSizeMB,
      })
      : () => undefined;

    // 控制区
    const controlsEl = container.createEl('div', { cls: 'player-controls' });

    // 播放按钮
    const playBtn = controlsEl.createEl('button', {
      cls: 'play-btn',
      attr: { 'aria-label': this.t('player.play.aria') },
    });
    playBtn.textContent = '▶';

    // 进度条容器
    const progressContainer = controlsEl.createEl('div', { cls: 'progress-container' });
    const progressBar = progressContainer.createEl('div', { cls: 'progress-bar' });
    const progressFill = progressBar.createEl('div', { cls: 'progress-fill' });
    const progressHandle = progressBar.createEl('div', { cls: 'progress-handle' });

    // 时间显示
    const timeEl = controlsEl.createEl('span', {
      cls: 'time-display',
      text: '00:00 / --:--',
    });

    // 倍速选择
    const speedSelect = controlsEl.createEl('select', { cls: 'speed-select' });
    [0.5, 0.75, 1.0, 1.25, 1.5, 2.0].forEach(speed => {
      const opt = speedSelect.createEl('option', {
        text: `${speed}x`,
        value: String(speed),
      });
      if (speed === 1.0) opt.selected = true;
    });

    // 操作按钮栏
    const actionsEl = container.createEl('div', { cls: 'player-actions' });
    const transcribeBtn = actionsEl.createEl('button', {
      cls: 'action-btn',
      text: this.t('player.action.transcribe'),
    });
    const summarizeBtn = actionsEl.createEl('button', {
      cls: 'action-btn',
      text: this.t('player.action.summarize'),
    });

    // ==================== 事件绑定 ====================

    // 播放/暂停
    playBtn.addEventListener('click', () => {
      if (!audio.src) {
        audio.src = audioUrl;
      }
      if (audio.paused) {
        void audio.play();
      } else {
        audio.pause();
      }
    });

    audio.addEventListener('play', () => {
      playBtn.textContent = '⏸';
      playBtn.addClass('playing');
      // 设为活跃播放器
      AudioEmbedProcessor.activeAudio = audio;
      AudioEmbedProcessor.activeFilePath = params.file;
    });

    audio.addEventListener('pause', () => {
      playBtn.textContent = '▶';
      playBtn.removeClass('playing');
    });

    audio.addEventListener('ended', () => {
      playBtn.textContent = '▶';
      playBtn.removeClass('playing');
      progressFill.setCssProps({ width: '0%' });
      progressHandle.setCssProps({ left: '0%' });
    });

    // 时间更新
    audio.addEventListener('timeupdate', () => {
      if (!audio.duration || isNaN(audio.duration)) return;
      const pct = (audio.currentTime / audio.duration) * 100;
      progressFill.setCssProps({ width: `${pct}%` });
      progressHandle.setCssProps({ left: `${pct}%` });
      timeEl.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
    });

    // 加载完成后更新时长
    audio.addEventListener('loadedmetadata', () => {
      if (audio.duration && !isNaN(audio.duration)) {
        timeEl.textContent = `00:00 / ${formatTime(audio.duration)}`;
      }
    });

    // 进度条点击跳转
    progressBar.addEventListener('click', (e) => {
      if (!audio.duration || isNaN(audio.duration)) return;
      const rect = progressBar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      audio.currentTime = pct * audio.duration;
    });

    // 进度条拖拽
    let isDragging = false;
    progressBar.addEventListener('mousedown', (e) => {
      isDragging = true;
      e.preventDefault();
    });

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging || !audio.duration || isNaN(audio.duration)) return;
      const rect = progressBar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      audio.currentTime = pct * audio.duration;
    };
    document.addEventListener('mousemove', onMouseMove);

    const onMouseUp = () => {
      isDragging = false;
    };
    document.addEventListener('mouseup', onMouseUp);

    // 倍速切换
    speedSelect.addEventListener('change', () => {
      audio.playbackRate = parseFloat(speedSelect.value);
    });

    // 转写按钮（Phase 3 实现具体逻辑）
    transcribeBtn.addEventListener('click', () => {
      void (async () => {
        const runResult = await this.plugin.transcribeAudioFile(params.file);
        if (runResult?.result?.fullText) {
          transcriptPanel.detailsEl.open = true;
          this.applyTranscriptionToPanel(runResult.result, transcriptPanel);
        }
        if (!destroyed && !runResult?.result) {
          void this.refreshTranscriptPanel(params.file, transcriptPanel);
        }
      })();
    });

    // 总结按钮
    summarizeBtn.addEventListener('click', () => {
      void (async () => {
        summarizeBtn.disabled = true;
        let generatedSummary: string | null = null;
        try {
          generatedSummary = await this.plugin.summarizeAudioFile(params.file, undefined, sourcePath);
          if (!destroyed && generatedSummary?.trim()) {
            summaryPanel.detailsEl.open = true;
            this.applySummaryToPanel(generatedSummary, summaryPanel);
          }
        } finally {
          if (!destroyed) {
            summarizeBtn.disabled = false;
            if (!generatedSummary?.trim()) {
              void this.refreshSummaryPanel(params.file, summaryPanel);
            }
          }
        }
      })();
    });

    return () => {
      destroyed = true;
      waveformCleanup();
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }

  private async tryRecoverAudioSource(
    audioFile: TFile,
    audio: HTMLAudioElement,
    saveFallbackUrl: (url: string) => void,
    force: boolean,
    isDestroyed?: () => boolean,
  ): Promise<void> {
    try {
      const buffer = await this.plugin.app.vault.readBinary(audioFile);
      // 异步操作完成后检查是否已被销毁（用户可能已切换笔记）
      if (isDestroyed?.()) {
        return;
      }
      const mimeType = this.detectMimeType(new Uint8Array(buffer), audioFile.path);
      if (!mimeType) {
        return;
      }

      const fallbackUrl = URL.createObjectURL(new Blob([buffer], { type: mimeType }));
      saveFallbackUrl(fallbackUrl);

      const wasPlaying = !audio.paused;
      audio.src = fallbackUrl;
      if (force) {
        audio.load();
      }
      if (wasPlaying) {
        void audio.play();
      }
    } catch (err) {
      if (!isDestroyed?.()) {
        console.error('Lecture Recorder: 回退音频源失败', err);
      }
    }
  }

  private detectMimeType(bytes: Uint8Array, filePath: string): string | null {
    if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
      return 'audio/webm';
    }
    if (bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
      return 'audio/ogg';
    }
    if (
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x41 &&
      bytes[10] === 0x56 &&
      bytes[11] === 0x45
    ) {
      return 'audio/wav';
    }
    if (
      bytes.length >= 3 &&
      bytes[0] === 0x49 &&
      bytes[1] === 0x44 &&
      bytes[2] === 0x33
    ) {
      return 'audio/mpeg';
    }

    const lowerPath = filePath.toLowerCase();
    if (lowerPath.endsWith('.ogg')) return 'audio/ogg';
    if (lowerPath.endsWith('.wav')) return 'audio/wav';
    if (lowerPath.endsWith('.mp3')) return 'audio/mpeg';
    if (lowerPath.endsWith('.m4a') || lowerPath.endsWith('.mp4')) return 'audio/mp4';
    if (lowerPath.endsWith('.webm')) return 'audio/webm';

    return null;
  }

  private createTranscriptPanel(container: HTMLElement): ResultPanel {
    const detailsEl = container.createEl('details', { cls: 'transcript-collapse' });
    const summaryEl = detailsEl.createEl('summary', {
      cls: 'transcript-summary',
      text: this.t('player.transcript.emptyTitle'),
    });
    const contentEl = detailsEl.createEl('div', {
      cls: 'transcript-content',
      text: this.t('player.transcript.emptyContent'),
    });

    return {
      detailsEl,
      summaryEl,
      contentEl,
    };
  }

  private createSummaryPanel(container: HTMLElement): ResultPanel {
    const detailsEl = container.createEl('details', { cls: 'summary-collapse' });
    const summaryEl = detailsEl.createEl('summary', {
      cls: 'summary-summary',
      text: this.t('player.summary.emptyTitle'),
    });
    const contentEl = detailsEl.createEl('div', {
      cls: 'summary-content',
      text: this.t('player.summary.emptyContent'),
    });

    return {
      detailsEl,
      summaryEl,
      contentEl,
    };
  }

  private async refreshTranscriptPanel(
    filePath: string,
    panel: {
      detailsEl: HTMLDetailsElement;
      summaryEl: HTMLElement;
      contentEl: HTMLElement;
    },
  ): Promise<void> {
    const cached = await this.plugin.getCachedTranscription(filePath);
    if (!panel.contentEl.isConnected) {
      return;
    }

    this.applyTranscriptionToPanel(cached, panel);
  }

  private async refreshSummaryPanel(
    filePath: string,
    panel: ResultPanel,
  ): Promise<void> {
    const cached = await this.plugin.getCachedSummary(filePath);
    if (!panel.contentEl.isConnected) {
      return;
    }

    this.applySummaryToPanel(cached, panel);
  }

  private applyTranscriptionToPanel(
    transcription: TranscriptionResult | null,
    panel: ResultPanel,
  ): void {
    const fullText = transcription?.fullText?.trim() || '';
    if (!fullText) {
      panel.summaryEl.textContent = this.t('player.transcript.emptyTitle');
      panel.contentEl.textContent = this.t('player.transcript.emptyContent');
      return;
    }

    const segmentCount = transcription?.segments?.length || 1;
    panel.summaryEl.textContent = this.t('player.transcript.readyTitle', { count: segmentCount });
    panel.contentEl.textContent = fullText;
  }

  private applySummaryToPanel(
    summaryMarkdown: string | null,
    panel: ResultPanel,
  ): void {
    const normalized = summaryMarkdown?.trim() || '';
    if (!normalized) {
      panel.summaryEl.textContent = this.t('player.summary.emptyTitle');
      panel.contentEl.textContent = this.t('player.summary.emptyContent');
      return;
    }

    panel.summaryEl.textContent = this.t('player.summary.readyTitle', {
      chars: normalized.length,
    });
    panel.contentEl.textContent = normalized;
  }

  /**
   * 解析代码块参数
   */
  private parseParams(source: string): AudioEmbedParams {
    const params: Record<string, string> = {};
    source.split('\n').forEach(line => {
      const match = line.match(/^([\w-]+):\s*(.*)$/);
      if (match) params[match[1]] = match[2].trim();
    });
    return {
      file: params.file || '',
      title: params.title || '',
      duration: params.duration || '',
      status: params.status,
      id: params.id,
      transcription: params.transcription,
    };
  }

  private t(
    key: Parameters<typeof i18n>[1],
    vars?: Record<string, string | number>,
  ): string {
    return i18n(this.plugin.settings.uiLanguage, key, vars);
  }
}
