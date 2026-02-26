import { ItemView, Notice, WorkspaceLeaf } from 'obsidian';
import type LectureRecorderPlugin from '../main';
import type { RecordingListItem } from '../main';
import { i18n } from '../i18n';
import { RecorderState } from './AudioRecorder';
import { VIEW_TYPE_RECORDER } from '../utils/constants';
import { formatDuration } from '../utils/timeUtils';

export class RecorderControlView extends ItemView {
  private plugin: LectureRecorderPlugin;
  private timerInterval: number | null = null;
  private stateListener: ((state: RecorderState) => void) | null = null;

  // 顶部录音控件
  private timerEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private recordBtn: HTMLButtonElement | null = null;
  private pauseBtn: HTMLButtonElement | null = null;

  // Phase 5: 录音管理列表
  private managerSectionEl: HTMLElement | null = null;
  private managerStatusEl: HTMLElement | null = null;
  private managerListEl: HTMLElement | null = null;
  private selectedPaths = new Set<string>();
  private managerBusy = false;

  constructor(leaf: WorkspaceLeaf, plugin: LectureRecorderPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_RECORDER;
  }

  getDisplayText(): string {
    return this.t('panel.title');
  }

  getIcon(): string {
    return 'microphone';
  }

  async onOpen(): Promise<void> {
    const container = this.contentEl;
    container.empty();
    container.addClass('lecture-recorder-panel');

    // 标题
    container.createEl('h4', { text: this.t('panel.title'), cls: 'recorder-panel-title' });

    // 时长显示
    this.timerEl = container.createEl('div', { cls: 'recorder-timer', text: '00:00:00' });

    // 状态指示
    this.statusEl = container.createEl('div', { cls: 'recorder-status', text: this.t('state.ready') });

    // 控制按钮容器
    const controls = container.createEl('div', { cls: 'recorder-controls' });

    this.recordBtn = controls.createEl('button', {
      cls: 'recorder-btn record-btn',
      text: this.t('btn.startRecording'),
    });

    this.pauseBtn = controls.createEl('button', {
      cls: 'recorder-btn pause-btn',
      text: this.t('btn.pause'),
    });
    this.pauseBtn.disabled = true;

    this.recordBtn.addEventListener('click', async () => {
      await this.handleRecordClick();
    });

    this.pauseBtn.addEventListener('click', () => {
      this.handlePauseClick();
    });

    this.renderManagerSection(container);

    this.stateListener = (state) => {
      this.updateUI(state);
    };
    this.plugin.recorder.addStateListener(this.stateListener);

    this.updateUI(this.plugin.recorder.getState());
    await this.refreshRecordingList();
  }

  async onClose(): Promise<void> {
    this.stopTimer();
    if (this.stateListener) {
      this.plugin.recorder.removeStateListener(this.stateListener);
      this.stateListener = null;
    }
  }

  private async handleRecordClick(): Promise<void> {
    await this.plugin.toggleRecordingWithInlineBlock();
    // 录音状态变化后列表可能新增文件，延迟刷新
    window.setTimeout(() => {
      void this.refreshRecordingList();
    }, 300);
  }

  private handlePauseClick(): void {
    this.plugin.recorder.pauseResume();
  }

  private updateUI(state: RecorderState): void {
    if (!this.recordBtn || !this.pauseBtn || !this.statusEl || !this.timerEl) return;

    switch (state) {
      case RecorderState.IDLE:
        this.recordBtn.textContent = this.t('btn.startRecording');
        this.recordBtn.removeClass('recording');
        this.pauseBtn.disabled = true;
        this.pauseBtn.textContent = this.t('btn.pause');
        this.statusEl.textContent = this.t('state.ready');
        this.statusEl.className = 'recorder-status';
        this.timerEl.textContent = '00:00:00';
        this.stopTimer();
        break;

      case RecorderState.RECORDING:
        this.recordBtn.textContent = this.t('btn.stopRecording');
        this.recordBtn.addClass('recording');
        this.pauseBtn.disabled = false;
        this.pauseBtn.textContent = this.t('btn.pause');
        this.statusEl.textContent = this.t('state.recording');
        this.statusEl.className = 'recorder-status status-recording';
        this.startTimer();
        break;

      case RecorderState.PAUSED:
        this.recordBtn.textContent = this.t('btn.stopRecording');
        this.recordBtn.addClass('recording');
        this.pauseBtn.disabled = false;
        this.pauseBtn.textContent = this.t('btn.resume');
        this.statusEl.textContent = this.t('state.paused');
        this.statusEl.className = 'recorder-status status-paused';
        this.stopTimer();
        break;
    }
  }

  private startTimer(): void {
    this.stopTimer();
    this.timerInterval = window.setInterval(() => {
      if (this.timerEl) {
        const elapsed = this.plugin.recorder.getElapsedTime();
        this.timerEl.textContent = formatDuration(elapsed);
      }
    }, 200);
  }

  private stopTimer(): void {
    if (this.timerInterval !== null) {
      window.clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private renderManagerSection(container: HTMLElement): void {
    const sectionEl = container.createDiv({ cls: 'recording-manager-section' });
    this.managerSectionEl = sectionEl;

    const headerEl = sectionEl.createDiv({ cls: 'recording-manager-header' });
    headerEl.createEl('h5', { text: this.t('manager.title') });
    const refreshBtn = headerEl.createEl('button', {
      cls: 'recorder-btn manager-refresh-btn',
      text: this.t('manager.refresh'),
    });
    refreshBtn.addEventListener('click', () => {
      void this.refreshRecordingList();
    });

    const batchBar = sectionEl.createDiv({ cls: 'recording-manager-batch' });
    const selectAllBtn = batchBar.createEl('button', {
      cls: 'action-btn',
      text: this.t('manager.selectAll'),
    });
    const clearBtn = batchBar.createEl('button', {
      cls: 'action-btn',
      text: this.t('manager.clear'),
    });
    const batchTranscribeBtn = batchBar.createEl('button', {
      cls: 'action-btn',
      text: this.t('manager.batchTranscribe'),
    });
    const batchSummarizeBtn = batchBar.createEl('button', {
      cls: 'action-btn',
      text: this.t('manager.batchSummarize'),
    });
    const batchBothBtn = batchBar.createEl('button', {
      cls: 'action-btn',
      text: this.t('manager.batchBoth'),
    });

    selectAllBtn.addEventListener('click', () => {
      const checkboxes = this.managerListEl?.querySelectorAll<HTMLInputElement>('input.recording-item-checkbox');
      checkboxes?.forEach((checkbox) => {
        checkbox.checked = true;
        const path = checkbox.dataset.path;
        if (path) {
          this.selectedPaths.add(path);
        }
      });
    });

    clearBtn.addEventListener('click', () => {
      const checkboxes = this.managerListEl?.querySelectorAll<HTMLInputElement>('input.recording-item-checkbox');
      checkboxes?.forEach((checkbox) => {
        checkbox.checked = false;
      });
      this.selectedPaths.clear();
    });

    batchTranscribeBtn.addEventListener('click', async () => {
      await this.runBatchAction('transcribe');
    });
    batchSummarizeBtn.addEventListener('click', async () => {
      await this.runBatchAction('summarize');
    });
    batchBothBtn.addEventListener('click', async () => {
      await this.runBatchAction('both');
    });

    this.managerStatusEl = sectionEl.createDiv({ cls: 'recording-manager-status' });
    this.managerListEl = sectionEl.createDiv({ cls: 'recording-manager-list' });
  }

  private async refreshRecordingList(): Promise<void> {
    if (!this.managerListEl) {
      return;
    }

    const items = await this.plugin.getRecordingListItems();
    if (!this.managerListEl.isConnected) {
      return;
    }

    this.managerListEl.empty();

    if (items.length === 0) {
      this.managerListEl.createDiv({
        cls: 'recording-manager-empty',
        text: this.t('manager.empty'),
      });
      this.setManagerStatus('');
      return;
    }

    for (const item of items) {
      this.renderRecordingRow(item);
    }

    this.setManagerStatus(this.t('manager.totalCount', { count: items.length }));
  }

  private renderRecordingRow(item: RecordingListItem): void {
    if (!this.managerListEl) {
      return;
    }

    const row = this.managerListEl.createDiv({ cls: 'recording-item-row' });
    const mainEl = row.createDiv({ cls: 'recording-item-main' });

    const checkbox = mainEl.createEl('input', {
      cls: 'recording-item-checkbox',
      attr: { type: 'checkbox' },
    }) as HTMLInputElement;
    checkbox.dataset.path = item.filePath;
    checkbox.checked = this.selectedPaths.has(item.filePath);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        this.selectedPaths.add(item.filePath);
      } else {
        this.selectedPaths.delete(item.filePath);
      }
    });

    const infoEl = mainEl.createDiv({ cls: 'recording-item-info' });
    infoEl.createDiv({ cls: 'recording-item-name', text: item.fileName });
    infoEl.createDiv({
      cls: 'recording-item-meta',
      text: `${this.formatBytes(item.sizeBytes)} · ${this.formatDateTime(item.modifiedAt)}`,
    });

    const badgeEl = infoEl.createDiv({ cls: 'recording-item-badges' });
    badgeEl.createSpan({
      cls: item.hasTranscript ? 'recording-badge ok' : 'recording-badge',
      text: item.hasTranscript ? this.t('item.transcript') : this.t('item.noTranscript'),
    });
    badgeEl.createSpan({
      cls: item.hasSummary ? 'recording-badge ok' : 'recording-badge',
      text: item.hasSummary ? this.t('item.summary') : this.t('item.noSummary'),
    });

    const actionEl = row.createDiv({ cls: 'recording-item-actions' });
    const transcribeBtn = actionEl.createEl('button', {
      cls: 'action-btn',
      text: this.t('item.transcribe'),
    });
    const summarizeBtn = actionEl.createEl('button', {
      cls: 'action-btn',
      text: this.t('item.summarize'),
    });

    transcribeBtn.addEventListener('click', async () => {
      await this.runSingleAction(item.filePath, 'transcribe');
    });
    summarizeBtn.addEventListener('click', async () => {
      await this.runSingleAction(item.filePath, 'summarize');
    });
  }

  private async runSingleAction(
    filePath: string,
    mode: 'transcribe' | 'summarize',
  ): Promise<void> {
    if (this.managerBusy) {
      return;
    }

    this.setManagerBusy(true);
    try {
      if (mode === 'transcribe') {
        this.setManagerStatus(this.t('manager.singleTranscribing', {
          file: this.extractFileName(filePath),
        }));
        await this.plugin.transcribeAudioFile(filePath);
      } else {
        this.setManagerStatus(this.t('manager.singleSummarizing', {
          file: this.extractFileName(filePath),
        }));
        const preferredNotePath = this.plugin.app.workspace.getActiveFile()?.path;
        await this.plugin.summarizeAudioFile(filePath, undefined, preferredNotePath);
      }
      await this.refreshRecordingList();
    } finally {
      this.setManagerBusy(false);
    }
  }

  private async runBatchAction(
    mode: 'transcribe' | 'summarize' | 'both',
  ): Promise<void> {
    if (this.managerBusy) {
      return;
    }

    const targets = Array.from(this.selectedPaths);
    if (targets.length === 0) {
      new Notice(this.t('manager.noneSelected'));
      return;
    }

    this.setManagerBusy(true);
    try {
      const result = await this.plugin.batchProcessRecordings(targets, mode, (progress) => {
        this.setManagerStatus(this.t('manager.processing', {
          current: progress.current,
          total: progress.total,
          file: this.extractFileName(progress.filePath),
          message: progress.message,
        }));
      });

      this.setManagerStatus(this.t('manager.done', {
        ok: result.succeeded.length,
        total: result.total,
      }));

      if (result.failed.length > 0) {
        const firstFail = result.failed[0];
        new Notice(this.t('manager.batchFailed', {
          file: this.extractFileName(firstFail.filePath),
          reason: firstFail.reason,
        }));
      }

      await this.refreshRecordingList();
    } finally {
      this.setManagerBusy(false);
    }
  }

  private setManagerBusy(busy: boolean): void {
    this.managerBusy = busy;
    if (!this.managerSectionEl) {
      return;
    }
    this.managerSectionEl.toggleClass('is-busy', busy);
    const controls = this.managerSectionEl.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
      'button, input[type="checkbox"]',
    );
    controls.forEach((control) => {
      control.disabled = busy;
    });
  }

  private setManagerStatus(text: string): void {
    if (!this.managerStatusEl) {
      return;
    }
    this.managerStatusEl.textContent = text;
  }

  private formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return '0 B';
    }
    const kb = 1024;
    const mb = kb * 1024;
    if (bytes < kb) return `${bytes} B`;
    if (bytes < mb) return `${(bytes / kb).toFixed(1)} KB`;
    return `${(bytes / mb).toFixed(1)} MB`;
  }

  private formatDateTime(epochMs: number): string {
    const date = new Date(epochMs);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d} ${hh}:${mm}`;
  }

  private extractFileName(path: string): string {
    return path.split('/').pop() || path;
  }

  private t(
    key: Parameters<typeof i18n>[1],
    vars?: Record<string, string | number>,
  ): string {
    return i18n(this.plugin.settings.uiLanguage, key, vars);
  }
}
