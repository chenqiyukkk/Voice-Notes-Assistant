import { EditorView, Decoration, DecorationSet, WidgetType } from '@codemirror/view';
import { RangeSetBuilder, StateField, EditorState } from '@codemirror/state';
import { TFile } from 'obsidian';
import type LectureRecorderPlugin from '../main';
import type { TranscriptionResult } from '../transcription/types';
import { AudioEmbedProcessor } from './AudioEmbedProcessor';
import { RecorderState } from '../recorder/AudioRecorder';
import { formatDuration, formatTime } from '../utils/timeUtils';
import { attachWaveform } from '../utils/waveform';

interface AudioEmbedParams {
  file: string;
  title: string;
  duration: string;
  status?: string;
  id?: string;
}

/**
 * CM6 Widget：在 Live Preview 模式下渲染 lecture-audio 播放器
 */
class AudioPlayerWidget extends WidgetType {
  private cleanupFns: Array<() => void> = [];
  private audio: HTMLAudioElement | null = null;
  private destroyed = false;
  private fallbackUrl: string | null = null;
  private fallbackAttempted = false;

  constructor(
    private params: AudioEmbedParams,
    private plugin: LectureRecorderPlugin,
  ) {
    super();
  }

  eq(other: AudioPlayerWidget): boolean {
    return (
      this.params.file === other.params.file &&
      this.params.title === other.params.title &&
      this.params.duration === other.params.duration
    );
  }

  toDOM(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'lecture-audio-player';

    try {
      // 获取音频文件
      const audioFile = this.plugin.app.vault.getAbstractFileByPath(this.params.file);
      if (!audioFile || !(audioFile instanceof TFile)) {
        container.className = 'player-error';
        container.textContent = `音频文件未找到: ${this.params.file}`;
        return container;
      }

      const audioUrl = this.plugin.app.vault.getResourcePath(audioFile);

      // 不在初始化时预加载音频，避免在 CM6 初始化过程中触发大文件 IO
      const audio = new Audio();
      audio.preload = 'none';
      this.audio = audio;

      // 音频错误时通过 readBinary 回退到 Blob 源
      const onAudioError = () => {
        if (this.fallbackAttempted || this.destroyed) {
          return;
        }
        this.fallbackAttempted = true;
        void this.tryRecoverAudioSource(audioFile, audio);
      };
      audio.addEventListener('error', onAudioError);
      this.cleanupFns.push(() => audio.removeEventListener('error', onAudioError));

      // 延迟设置 src：等 CM6 初始化完成后再设置，避免阻塞笔记打开
      window.setTimeout(() => {
        if (!this.destroyed) {
          audio.src = audioUrl;
        }
      }, 0);

      this.buildPlayer(container, audio, audioUrl, audioFile);

      // 标记为活跃播放器
      AudioEmbedProcessor.setActiveAudio(audio, this.params.file);
    } catch (err) {
      console.error('Lecture Recorder: AudioPlayerWidget.toDOM 失败', err);
      container.className = 'player-error';
      container.textContent = '播放器加载失败';
    }

    return container;
  }

  /**
   * 让 widget 拦截所有 DOM 事件（点击、拖拽等），不传给编辑器
   */
  ignoreEvent(): boolean {
    return true;
  }

  destroy(): void {
    this.destroyed = true;
    this.cleanupFns.forEach(fn => fn());
    this.cleanupFns = [];

    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
      this.audio = null;
    }

    if (this.fallbackUrl) {
      URL.revokeObjectURL(this.fallbackUrl);
      this.fallbackUrl = null;
    }
  }

  private buildPlayer(
    container: HTMLElement,
    audio: HTMLAudioElement,
    audioUrl: string,
    audioFile: TFile,
  ): void {
    const params = this.params;

    // 标题栏
    const headerEl = container.createDiv({ cls: 'player-header' });
    headerEl.createSpan({ cls: 'player-icon', text: '🎙' });
    headerEl.createSpan({ cls: 'player-title', text: params.title || '未命名录音' });
    headerEl.createSpan({ cls: 'player-duration-badge', text: params.duration || '--:--:--' });
    const transcriptPanel = this.createTranscriptPanel(container);
    void this.refreshTranscriptPanel(params.file, transcriptPanel);
    if (this.plugin.settings.waveformEnabled) {
      this.cleanupFns.push(attachWaveform({
        hostEl: container,
        audio,
        filePath: params.file,
        readBinary: (filePath: string) => this.plugin.audioFileManager.readBinary(filePath),
        maxFileSizeMB: this.plugin.settings.waveformMaxFileSizeMB,
      }));
    }

    // 控制区
    const controlsEl = container.createDiv({ cls: 'player-controls' });

    // 播放按钮
    const playBtn = controlsEl.createEl('button', { cls: 'play-btn', attr: { 'aria-label': '播放' } });
    playBtn.innerHTML = '▶';

    // 进度条
    const progressContainer = controlsEl.createDiv({ cls: 'progress-container' });
    const progressBar = progressContainer.createDiv({ cls: 'progress-bar' });
    const progressFill = progressBar.createDiv({ cls: 'progress-fill' });
    const progressHandle = progressBar.createDiv({ cls: 'progress-handle' });

    // 时间显示
    const timeEl = controlsEl.createSpan({ cls: 'time-display', text: '00:00 / --:--' });

    // 倍速选择
    const speedSelect = controlsEl.createEl('select', { cls: 'speed-select' });
    [0.5, 0.75, 1.0, 1.25, 1.5, 2.0].forEach(speed => {
      const opt = speedSelect.createEl('option', { text: `${speed}x`, value: String(speed) });
      if (speed === 1.0) opt.selected = true;
    });

    // 操作按钮栏
    const actionsEl = container.createDiv({ cls: 'player-actions' });
    const transcribeBtn = actionsEl.createEl('button', { cls: 'action-btn', text: '📝 转写录音' });
    const summarizeBtn = actionsEl.createEl('button', { cls: 'action-btn', text: '✨ 生成纪要' });

    // ==================== 事件绑定 ====================

    // 首次播放时确保 audio 已加载源
    let audioSourceReady = false;
    const ensureAudioSource = () => {
      if (audioSourceReady) return;
      audioSourceReady = true;
      if (!audio.src) {
        audio.src = audioUrl;
      }
      audio.preload = 'auto';
    };

    playBtn.addEventListener('click', () => {
      ensureAudioSource();
      if (audio.paused) {
        void audio.play().catch(() => {
          if (!this.fallbackAttempted && !this.destroyed) {
            this.fallbackAttempted = true;
            void this.tryRecoverAudioSource(audioFile, audio).then(() => {
              if (!this.destroyed) {
                void audio.play();
              }
            });
          }
        });
      } else {
        audio.pause();
      }
    });

    audio.addEventListener('play', () => {
      playBtn.innerHTML = '⏸';
      playBtn.addClass('playing');
      AudioEmbedProcessor.setActiveAudio(audio, params.file);
    });

    audio.addEventListener('pause', () => {
      playBtn.innerHTML = '▶';
      playBtn.removeClass('playing');
    });

    audio.addEventListener('ended', () => {
      playBtn.innerHTML = '▶';
      playBtn.removeClass('playing');
      progressFill.style.width = '0%';
      progressHandle.style.left = '0%';
    });

    audio.addEventListener('timeupdate', () => {
      if (!audio.duration || isNaN(audio.duration)) return;
      const pct = (audio.currentTime / audio.duration) * 100;
      progressFill.style.width = `${pct}%`;
      progressHandle.style.left = `${pct}%`;
      timeEl.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
    });

    audio.addEventListener('loadedmetadata', () => {
      if (audio.duration && !isNaN(audio.duration)) {
        timeEl.textContent = `00:00 / ${formatTime(audio.duration)}`;
      }
    });

    progressBar.addEventListener('click', (e) => {
      ensureAudioSource();
      if (!audio.duration || isNaN(audio.duration)) return;
      const rect = progressBar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      audio.currentTime = pct * audio.duration;
    });

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
    const onMouseUp = () => {
      isDragging = false;
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    this.cleanupFns.push(() => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    });

    speedSelect.addEventListener('change', () => {
      audio.playbackRate = parseFloat(speedSelect.value);
    });

    transcribeBtn.addEventListener('click', async () => {
      const runResult = await this.plugin.transcribeAudioFile(params.file);
      if (runResult?.result?.fullText) {
        transcriptPanel.detailsEl.open = true;
        this.applyTranscriptionToPanel(runResult.result, transcriptPanel);
      }
      if (!this.destroyed && !runResult?.result) {
        void this.refreshTranscriptPanel(params.file, transcriptPanel);
      }
    });

    summarizeBtn.addEventListener('click', async () => {
      summarizeBtn.disabled = true;
      const preferredNotePath = this.plugin.app.workspace.getActiveFile()?.path;
      try {
        await this.plugin.summarizeAudioFile(params.file, undefined, preferredNotePath);
      } finally {
        if (!this.destroyed) {
          summarizeBtn.disabled = false;
        }
      }
    });
  }

  /**
   * 通过 readBinary 读取音频文件并创建 Blob URL 作为回退源。
   * 仅在 app:// ResourcePath 加载失败时或首次播放失败时调用。
   */
  private async tryRecoverAudioSource(
    audioFile: TFile,
    audio: HTMLAudioElement,
  ): Promise<void> {
    try {
      const buffer = await this.plugin.app.vault.readBinary(audioFile);
      if (this.destroyed) {
        return;
      }
      const mimeType = this.detectMimeType(new Uint8Array(buffer), audioFile.path);
      if (!mimeType) {
        return;
      }

      if (this.fallbackUrl) {
        URL.revokeObjectURL(this.fallbackUrl);
      }
      this.fallbackUrl = URL.createObjectURL(new Blob([buffer], { type: mimeType }));
      audio.src = this.fallbackUrl;
      audio.load();
    } catch (err) {
      if (!this.destroyed) {
        console.error('Lecture Recorder: Live Preview 音频回退失败', err);
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

  private createTranscriptPanel(container: HTMLElement): {
    detailsEl: HTMLDetailsElement;
    summaryEl: HTMLElement;
    contentEl: HTMLElement;
  } {
    const detailsEl = container.createEl('details', { cls: 'transcript-collapse' }) as HTMLDetailsElement;
    const summaryEl = detailsEl.createEl('summary', {
      cls: 'transcript-summary',
      text: '🧾 转写结果（未生成）',
    });
    const contentEl = detailsEl.createEl('div', {
      cls: 'transcript-content',
      text: '暂无转写结果，点击"转写录音"后可在此展开查看。',
    });

    return { detailsEl, summaryEl, contentEl };
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
    if (this.destroyed || !panel.contentEl.isConnected) {
      return;
    }

    this.applyTranscriptionToPanel(cached, panel);
  }

  private applyTranscriptionToPanel(
    transcription: TranscriptionResult | null,
    panel: {
      detailsEl: HTMLDetailsElement;
      summaryEl: HTMLElement;
      contentEl: HTMLElement;
    },
  ): void {
    const fullText = transcription?.fullText?.trim() || '';
    if (!fullText) {
      panel.summaryEl.textContent = '🧾 转写结果（未生成）';
      panel.contentEl.textContent = '暂无转写结果，点击"转写录音"后可在此展开查看。';
      return;
    }

    const segmentCount = transcription?.segments?.length || 1;
    panel.summaryEl.textContent = `🧾 转写结果（${segmentCount} 段，点击展开）`;
    panel.contentEl.textContent = fullText;
  }
}

/**
 * CM6 Widget：在 Live Preview 模式下渲染录音进行中的控制块
 */
class RecordingWidget extends WidgetType {
  private timerInterval: number | null = null;

  constructor(
    private params: AudioEmbedParams,
    private plugin: LectureRecorderPlugin,
  ) {
    super();
  }

  eq(other: RecordingWidget): boolean {
    return (
      this.params.status === other.params.status &&
      this.params.title === other.params.title &&
      this.params.id === other.params.id
    );
  }

  toDOM(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'lecture-recording-widget';

    const headerEl = container.createDiv({ cls: 'recording-header' });
    headerEl.createSpan({ cls: 'recording-dot' });
    headerEl.createSpan({ cls: 'recording-title', text: this.params.title || '未命名课程' });
    const stateEl = headerEl.createSpan({ cls: 'recording-state-badge', text: '录音中' });

    const bodyEl = container.createDiv({ cls: 'recording-body' });
    const timerEl = bodyEl.createSpan({
      cls: 'recording-timer',
      text: formatDuration(this.plugin.recorder.getElapsedTime()),
    });

    const controlsEl = bodyEl.createDiv({ cls: 'recording-controls' });
    const pauseBtn = controlsEl.createEl('button', {
      cls: 'recording-action-btn',
      text: '暂停',
      attr: { 'aria-label': '暂停或继续录音' },
    });
    const stopBtn = controlsEl.createEl('button', {
      cls: 'recording-action-btn stop',
      text: '停止',
      attr: { 'aria-label': '停止录音' },
    });

    const syncState = () => {
      const state = this.plugin.recorder.getState();

      if (state === RecorderState.RECORDING) {
        stateEl.textContent = '录音中';
        pauseBtn.textContent = '暂停';
        pauseBtn.disabled = false;
        stopBtn.disabled = false;
      } else if (state === RecorderState.PAUSED) {
        stateEl.textContent = '已暂停';
        pauseBtn.textContent = '继续';
        pauseBtn.disabled = false;
        stopBtn.disabled = false;
      } else {
        stateEl.textContent = '处理中';
        pauseBtn.disabled = true;
        stopBtn.disabled = true;
      }

      timerEl.textContent = formatDuration(this.plugin.recorder.getElapsedTime());
    };

    pauseBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.plugin.recorder.pauseResume();
      syncState();
    });

    stopBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (stopBtn.disabled) return;

      pauseBtn.disabled = true;
      stopBtn.disabled = true;
      await this.plugin.stopRecordingAndFinalize();
    });

    syncState();
    this.timerInterval = window.setInterval(syncState, 200);

    return container;
  }

  ignoreEvent(): boolean {
    return true;
  }

  destroy(): void {
    if (this.timerInterval !== null) {
      window.clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }
}

/**
 * 解析代码块参数
 */
function parseParams(source: string): AudioEmbedParams {
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
  };
}

/**
 * 根据 EditorState 构建装饰集
 * 使用 StateField 而非 ViewPlugin，以支持 block: true 的 Decoration.replace
 */
function buildDecorations(state: EditorState, plugin: LectureRecorderPlugin): DecorationSet {
  try {
    const builder = new RangeSetBuilder<Decoration>();
    const doc = state.doc;

    let inBlock = false;
    let blockStartLine = 0;
    let blockContent = '';

    for (let i = 1; i <= doc.lines; i++) {
      const line = doc.line(i);
      const text = line.text;

      if (!inBlock && text.trim() === '```lecture-audio') {
        inBlock = true;
        blockStartLine = i;
        blockContent = '';
      } else if (inBlock && text.trim() === '```') {
        // 代码块结束
        const startLine = doc.line(blockStartLine);
        const endLine = line;
        const blockFrom = startLine.from;
        const blockTo = endLine.to;
        const params = parseParams(blockContent);

        if (params.status === 'recording') {
          // 录音中的块始终替换渲染，避免用户编辑中间态数据
          builder.add(
            blockFrom,
            blockTo,
            Decoration.replace({
              widget: new RecordingWidget(params, plugin),
              block: true,
            }),
          );
        } else if (params.file) {
          // 普通播放器块仍允许在光标进入时显示源码，便于手动编辑
          const selection = state.selection.main;
          const cursorInBlock = selection.from >= blockFrom && selection.from <= blockTo;

          if (!cursorInBlock) {
            builder.add(
              blockFrom,
              blockTo,
              Decoration.replace({
                widget: new AudioPlayerWidget(params, plugin),
                block: true,
              }),
            );
          }
        }

        inBlock = false;
      } else if (inBlock) {
        blockContent += text + '\n';
      }
    }

    return builder.finish();
  } catch (err) {
    console.error('Lecture Recorder: buildDecorations 失败', err);
    return Decoration.none;
  }
}

/**
 * 创建 Live Preview CM6 扩展
 * 使用 StateField 提供 block 级别装饰（ViewPlugin 不允许 block decorations）
 */
export function createLivePreviewExtension(plugin: LectureRecorderPlugin) {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildDecorations(state, plugin);
    },
    update(value, tr) {
      if (tr.docChanged || tr.selection) {
        return buildDecorations(tr.state, plugin);
      }
      return value;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}
