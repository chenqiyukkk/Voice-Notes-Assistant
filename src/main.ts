import { Plugin, WorkspaceLeaf, TFile, MarkdownView, Notice, Editor } from 'obsidian';
import { LectureRecorderSettings, DEFAULT_SETTINGS, LectureRecorderSettingTab } from './settings';
import { AudioRecorder } from './recorder/AudioRecorder';
import { RecorderControlView } from './recorder/RecorderControlView';
import { StatusBarManager } from './recorder/StatusBarManager';
import { AudioFileManager } from './storage/AudioFileManager';
import { AudioEmbedProcessor } from './embed/AudioEmbedProcessor';
import { TimestampManager } from './embed/TimestampManager';
import { createLivePreviewExtension } from './embed/LivePreviewExtension';
import { SummaryService } from './summary/SummaryService';
import { SummaryContext } from './summary/types';
import { TranscriptionRunResult, TranscriptionService } from './transcription/TranscriptionService';
import { TranscriptionProgress, TranscriptionResult } from './transcription/types';
import { AUDIO_EMBED_TYPE, VIEW_TYPE_RECORDER } from './utils/constants';
import { formatDuration } from './utils/timeUtils';

interface EditorContext {
  editor: Editor;
  file: TFile | null;
}

interface TextRange {
  start: number;
  end: number;
}

interface TextEditOperation {
  start: number;
  end: number;
  text: string;
}

interface AudioEmbedMatch {
  range: TextRange;
  params: Record<string, string>;
}

interface TaskRunOptions {
  silent?: boolean;
}

export interface RecordingListItem {
  filePath: string;
  fileName: string;
  sizeBytes: number;
  modifiedAt: number;
  hasTranscript: boolean;
  hasSummary: boolean;
}

export interface BatchProcessProgress {
  mode: 'transcribe' | 'summarize' | 'both';
  current: number;
  total: number;
  filePath: string;
  message: string;
}

export interface BatchProcessResult {
  mode: 'transcribe' | 'summarize' | 'both';
  total: number;
  succeeded: string[];
  failed: Array<{ filePath: string; reason: string }>;
}

export default class LectureRecorderPlugin extends Plugin {
  settings: LectureRecorderSettings = DEFAULT_SETTINGS;
  recorder: AudioRecorder = null!;
  statusBar: StatusBarManager = null!;
  audioFileManager: AudioFileManager = null!;
  transcriptionService: TranscriptionService = null!;
  summaryService: SummaryService = null!;

  /** 录音开始时保存的编辑器文件引用，防止焦点丢失后 activeEditor 为 null */
  recordingFile: TFile | null = null;
  private recordingBlockId: string | null = null;
  private recordingBlockFile: TFile | null = null;
  private transcribingTasks = new Map<string, Promise<TranscriptionRunResult | null>>();
  private summarizingTasks = new Map<string, Promise<string | null>>();
  private finalizeRecordingTask: Promise<void> | null = null;

  async onload() {
    await this.loadSettings();

    // 初始化核心服务
    this.recorder = new AudioRecorder(this);
    this.statusBar = new StatusBarManager(this);
    this.audioFileManager = new AudioFileManager(this);
    this.transcriptionService = new TranscriptionService(this);
    this.summaryService = new SummaryService(this);

    // 监听录音状态变化 -> 更新状态栏
    this.recorder.addStateListener((state) => {
      this.statusBar.update(state);
    });

    // 注册侧边栏视图
    this.registerView(
      VIEW_TYPE_RECORDER,
      (leaf) => new RecorderControlView(leaf, this),
    );

    // 添加左侧 ribbon icon
    this.addRibbonIcon('microphone', '打开录音面板', () => {
      this.activateRecorderView();
    });

    // ==================== 注册命令 ====================

    // 开始/停止录音
    this.addCommand({
      id: 'toggle-recording',
      name: '开始/停止录音',
      callback: async () => {
        await this.toggleRecordingWithInlineBlock();
      },
    });

    // 暂停/继续录音
    this.addCommand({
      id: 'pause-resume-recording',
      name: '暂停/继续录音',
      callback: () => {
        this.recorder.pauseResume();
      },
    });

    // 插入时间戳 (Phase 2 完善跳转功能，Phase 1 先实现插入)
    this.addCommand({
      id: 'insert-timestamp',
      name: '插入时间戳',
      editorCallback: (editor) => {
        if (this.recorder.isIdle()) {
          return;
        }
        const elapsed = this.recorder.getElapsedTime();
        const timeStr = formatDuration(elapsed);
        const cursor = editor.getCursor();
        editor.replaceRange(
          `\n> [!timestamp] ${timeStr}\n> \n\n`,
          cursor,
        );
        // 光标放在 "> " 后面让用户输入描述
        editor.setCursor({ line: cursor.line + 2, ch: 2 });
      },
    });

    // 打开录音面板
    this.addCommand({
      id: 'open-recorder-panel',
      name: '打开录音面板',
      callback: () => {
        this.activateRecorderView();
      },
    });

    this.addCommand({
      id: 'batch-transcribe-recordings',
      name: '批量转写全部录音',
      callback: async () => {
        const recordings = await this.getRecordingListItems();
        const pending = recordings.filter(item => !item.hasTranscript).map(item => item.filePath);
        if (pending.length === 0) {
          new Notice('没有需要转写的录音');
          return;
        }

        const result = await this.batchProcessRecordings(pending, 'transcribe');
        new Notice(`批量转写完成：成功 ${result.succeeded.length} / ${result.total}`);
      },
    });

    this.addCommand({
      id: 'batch-transcribe-and-summarize-recordings',
      name: '批量转写并总结全部录音',
      callback: async () => {
        const recordings = await this.getRecordingListItems();
        if (recordings.length === 0) {
          new Notice('没有可处理的录音');
          return;
        }

        const result = await this.batchProcessRecordings(
          recordings.map(item => item.filePath),
          'both',
        );
        new Notice(`批量处理完成：成功 ${result.succeeded.length} / ${result.total}`);
      },
    });

    // 注册设置面板
    this.addSettingTab(new LectureRecorderSettingTab(this.app, this));

    // Phase 2: 注册音频嵌入块渲染器
    const embedProcessor = new AudioEmbedProcessor(this);
    embedProcessor.register();

    // Phase 2: 注册时间戳点击跳转
    const timestampManager = new TimestampManager(this);
    timestampManager.register();

    // Phase 2: 注册 Live Preview CM6 扩展（使播放器在实时预览模式也能渲染）
    this.registerEditorExtension(createLivePreviewExtension(this));

    // 确保录音存储目录存在
    await this.audioFileManager.ensureStorageDir();

  }

  async onunload() {
    // 如果正在录音，先停止
    if (!this.recorder.isIdle()) {
      await this.stopRecordingAndFinalize({ triggerAutoTranscribe: false });
    }
    this.statusBar.destroy();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async toggleRecordingWithInlineBlock(): Promise<void> {
    if (this.recorder.isIdle()) {
      await this.startRecordingWithPlaceholder();
      return;
    }

    await this.stopRecordingAndFinalize();
  }

  async startRecordingWithPlaceholder(): Promise<void> {
    this.saveCurrentEditorRef();

    if (!this.insertRecordingPlaceholder()) {
      new Notice('请先打开一个笔记，再开始录音');
      return;
    }

    try {
      await this.recorder.start();
    } catch (err) {
      console.error('Lecture Recorder: 启动录音失败', err);
      new Notice('录音启动失败，请检查录音设备或设置');
      this.findAndRemoveRecordingBlock();
      this.clearRecordingBlockTracking();
      return;
    }

    // start() 内部已处理权限报错并返回，此时如果仍是 idle，说明录音未真正开始
    if (this.recorder.isIdle()) {
      this.findAndRemoveRecordingBlock();
      this.clearRecordingBlockTracking();
    }
  }

  async stopRecordingAndFinalize(options?: { triggerAutoTranscribe?: boolean }): Promise<void> {
    if (this.finalizeRecordingTask) {
      return await this.finalizeRecordingTask;
    }

    this.finalizeRecordingTask = this.doStopRecordingAndFinalize(options).finally(() => {
      this.finalizeRecordingTask = null;
    });

    return await this.finalizeRecordingTask;
  }

  private async doStopRecordingAndFinalize(options?: { triggerAutoTranscribe?: boolean }): Promise<void> {
    const triggerAutoTranscribe = options?.triggerAutoTranscribe ?? true;
    const result = await this.recorder.stop();

    if (!result.filePath) {
      this.findAndRemoveRecordingBlock();
      this.clearRecordingBlockTracking();
      this.recordingFile = null;
      return;
    }

    const updated = this.findAndUpdateRecordingBlock(result.filePath, result.duration);
    if (!updated) {
      this.insertEmbedBlockAtCursor(result.filePath, result.duration);
    } else {
      this.recordingFile = null;
    }

    this.clearRecordingBlockTracking();

    if (triggerAutoTranscribe && this.settings.autoTranscribe) {
      void this.transcribeAudioFile(result.filePath);
    }
  }

  async transcribeAudioFile(
    filePath: string,
    options?: TaskRunOptions,
  ): Promise<TranscriptionRunResult | null> {
    const silent = options?.silent ?? false;
    if (!filePath) {
      if (!silent) {
        new Notice('无法转写：音频文件路径为空');
      }
      return null;
    }

    const existingTask = this.transcribingTasks.get(filePath);
    if (existingTask) {
      if (!silent) {
        new Notice('该录音正在转写，请稍候');
      }
      return await existingTask;
    }

    const task = this.runTranscriptionTask(filePath, options);
    this.transcribingTasks.set(filePath, task);

    try {
      return await task;
    } finally {
      this.transcribingTasks.delete(filePath);
    }
  }

  async getCachedTranscription(filePath: string): Promise<TranscriptionResult | null> {
    if (!filePath) {
      return null;
    }
    return await this.transcriptionService.getCachedTranscription(filePath);
  }

  async getCachedSummary(filePath: string): Promise<string | null> {
    if (!filePath) {
      return null;
    }

    const sidecarPath = this.getSummarySidecarPath(filePath);
    const sidecar = this.app.vault.getAbstractFileByPath(sidecarPath);
    if (!(sidecar instanceof TFile)) {
      return null;
    }

    const content = await this.app.vault.read(sidecar);
    const extracted = this.extractSummaryTextFromSidecar(content);
    return extracted || null;
  }

  async summarizeAudioFile(
    filePath: string,
    transcription?: TranscriptionResult,
    preferredNotePath?: string,
    options?: TaskRunOptions,
  ): Promise<string | null> {
    const silent = options?.silent ?? false;
    if (!filePath) {
      if (!silent) {
        new Notice('无法生成纪要：音频文件路径为空');
      }
      return null;
    }

    const existingTask = this.summarizingTasks.get(filePath);
    if (existingTask) {
      if (!silent) {
        new Notice('该录音正在生成纪要，请稍候');
      }
      return await existingTask;
    }

    const task = this.runSummaryTask(filePath, transcription, preferredNotePath, options);
    this.summarizingTasks.set(filePath, task);

    try {
      return await task;
    } finally {
      this.summarizingTasks.delete(filePath);
    }
  }

  private async runSummaryTask(
    filePath: string,
    transcription?: TranscriptionResult,
    preferredNotePath?: string,
    options?: TaskRunOptions,
  ): Promise<string | null> {
    const silent = options?.silent ?? false;
    const audioName = filePath.split('/').pop() || filePath;
    const progressNotice = silent ? null : new Notice(`开始生成纪要: ${audioName}`, 0);

    try {
      const sourceTranscription = await this.resolveTranscriptionForSummary(filePath, transcription);
      if (!sourceTranscription?.fullText?.trim()) {
        throw new Error('缺少有效转写内容，请先完成转写');
      }

      const context = this.buildSummaryContext(filePath, sourceTranscription, preferredNotePath);
      const runResult = await this.summaryService.summarize(
        sourceTranscription,
        {
          context,
          template: this.settings.summaryTemplate,
        },
        (message) => {
          progressNotice?.setMessage(`生成纪要中 ${audioName}\n${message}`);
        },
      );

      const sidecarPath = await this.saveSummarySidecar(filePath, runResult.summary, context);

      progressNotice?.hide();

      if (!silent) {
        new Notice(`纪要已生成，可在音频块“纪要结果”折叠栏查看（缓存: ${sidecarPath}）`);
      }

      return runResult.summary;
    } catch (err) {
      progressNotice?.hide();
      const message = err instanceof Error ? err.message : String(err);
      console.error('Lecture Recorder: 生成纪要失败', err);
      if (!silent) {
        new Notice(`纪要生成失败: ${message}`, 10000);
      }
      return null;
    }
  }

  private async resolveTranscriptionForSummary(
    filePath: string,
    transcription?: TranscriptionResult,
  ): Promise<TranscriptionResult | null> {
    if (transcription?.fullText?.trim()) {
      return transcription;
    }

    const cached = await this.getCachedTranscription(filePath);
    if (cached?.fullText?.trim()) {
      return cached;
    }

    const transcribeResult = await this.transcribeAudioFile(filePath, { silent: true });
    if (transcribeResult?.result?.fullText?.trim()) {
      return transcribeResult.result;
    }

    return null;
  }

  private buildSummaryContext(
    filePath: string,
    transcription: TranscriptionResult,
    preferredNotePath?: string,
  ): SummaryContext {
    const preferredFile = this.resolveMarkdownFile(preferredNotePath);
    const activeFile = this.app.workspace.getActiveFile();
    const noteFile = preferredFile
      || ((activeFile instanceof TFile && activeFile.extension === 'md') ? activeFile : null);

    const durationSeconds = Number.isFinite(transcription.duration)
      ? Math.max(0, transcription.duration)
      : 0;

    return {
      courseName: noteFile?.basename || this.extractFileStem(filePath),
      date: this.formatDate(noteFile ? new Date(noteFile.stat.mtime) : new Date()),
      duration: durationSeconds > 0
        ? formatDuration(Math.floor(durationSeconds * 1000))
        : '00:00:00',
    };
  }

  async getRecordingListItems(): Promise<RecordingListItem[]> {
    const files = this.audioFileManager.listRecordings();
    const items: RecordingListItem[] = files.map((file) => {
      const transcriptPath = this.transcriptionService.getTranscriptPath(file.path);
      const transcriptFile = this.app.vault.getAbstractFileByPath(transcriptPath);
      const summaryFile = this.app.vault.getAbstractFileByPath(this.getSummarySidecarPath(file.path));
      return {
        filePath: file.path,
        fileName: file.name,
        sizeBytes: file.stat.size,
        modifiedAt: file.stat.mtime,
        hasTranscript: transcriptFile instanceof TFile,
        hasSummary: summaryFile instanceof TFile,
      };
    });

    return items.sort((a, b) => b.modifiedAt - a.modifiedAt);
  }

  async batchProcessRecordings(
    filePaths: string[],
    mode: 'transcribe' | 'summarize' | 'both',
    onProgress?: (progress: BatchProcessProgress) => void,
  ): Promise<BatchProcessResult> {
    const queue = Array.from(new Set(filePaths.filter(Boolean)));
    const succeeded: string[] = [];
    const failed: Array<{ filePath: string; reason: string }> = [];

    for (let i = 0; i < queue.length; i++) {
      const filePath = queue[i];
      const step = i + 1;
      onProgress?.({
        mode,
        current: step,
        total: queue.length,
        filePath,
        message: `开始处理 ${filePath}`,
      });

      try {
        let transcription: TranscriptionResult | undefined;
        if (mode === 'transcribe' || mode === 'both') {
          const transcribeResult = await this.transcribeAudioFile(filePath, { silent: true });
          if (!transcribeResult?.result?.fullText?.trim()) {
            throw new Error('转写未生成有效文本');
          }
          transcription = transcribeResult.result;
        }

        if (mode === 'summarize' || mode === 'both') {
          const summary = await this.summarizeAudioFile(
            filePath,
            transcription,
            undefined,
            { silent: true },
          );
          if (!summary?.trim()) {
            throw new Error('纪要未生成有效文本');
          }
        }

        succeeded.push(filePath);
        onProgress?.({
          mode,
          current: step,
          total: queue.length,
          filePath,
          message: '处理成功',
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failed.push({ filePath, reason: message });
        onProgress?.({
          mode,
          current: step,
          total: queue.length,
          filePath,
          message: `处理失败：${message}`,
        });
      }
    }

    return {
      mode,
      total: queue.length,
      succeeded,
      failed,
    };
  }

  private async runTranscriptionTask(
    filePath: string,
    options?: TaskRunOptions,
  ): Promise<TranscriptionRunResult | null> {
    const silent = options?.silent ?? false;
    const audioName = filePath.split('/').pop() || filePath;
    const progressNotice = silent ? null : new Notice(`开始转写: ${audioName}`, 0);

    try {
      const runResult = await this.transcriptionService.transcribeFile(
        filePath,
        (progress: TranscriptionProgress) => {
          if (progressNotice) {
            this.updateTranscriptionNotice(progressNotice, progress, audioName);
          }
        },
      );

      progressNotice?.hide();

      if (!silent && runResult.fromCache) {
        new Notice(`已使用缓存转写，可在播放器下方“转写结果”展开查看（备份: ${runResult.transcriptPath}）`);
      } else if (!silent) {
        new Notice(`转写完成，可在播放器下方“转写结果”展开查看（备份: ${runResult.transcriptPath}）`);
      }

      if (this.settings.autoSummarize) {
        void this.summarizeAudioFile(filePath, runResult.result, undefined, { silent });
      }

      return runResult;
    } catch (err) {
      progressNotice?.hide();
      const message = err instanceof Error ? err.message : String(err);
      console.error('Lecture Recorder: 转写失败', err);
      if (!silent) {
        new Notice(`转写失败: ${message}`, 10000);
      }
      return null;
    }
  }

  private updateTranscriptionNotice(
    notice: Notice,
    progress: TranscriptionProgress,
    audioName: string,
  ): void {
    const progressText = typeof progress.progress === 'number' ? ` [${progress.progress}%]` : '';
    notice.setMessage(`转写中${progressText} ${audioName}\n${progress.message}`);
  }

  /**
   * 激活录音控制面板
   */
  async activateRecorderView(): Promise<void> {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_RECORDER);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({
          type: VIEW_TYPE_RECORDER,
          active: true,
        });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  /**
   * 录音开始时保存当前编辑器文件引用
   */
  saveCurrentEditorRef(): void {
    const activeEditor = this.app.workspace.activeEditor;
    if (activeEditor?.file) {
      this.recordingFile = activeEditor.file;
      return;
    }

    const activeMarkdown = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeMarkdown?.file) {
      this.recordingFile = activeMarkdown.file;
      return;
    }

    const leaves = this.app.workspace.getLeavesOfType('markdown');
    for (const leaf of leaves) {
      if (leaf.view instanceof MarkdownView && leaf.view.file) {
        this.recordingFile = leaf.view.file;
        return;
      }
    }
  }

  insertRecordingPlaceholder(): boolean {
    const context = this.resolveEditorContext(this.recordingFile);
    if (!context) {
      return false;
    }

    const title = context.file?.basename || this.recordingFile?.basename || '未命名课程';
    const blockId = this.createRecordingBlockId();
    const block = this.buildRecordingPlaceholderBlock(title, blockId);

    context.editor.replaceRange(block, context.editor.getCursor());

    this.recordingBlockId = blockId;
    this.recordingBlockFile = context.file;
    if (context.file) {
      this.recordingFile = context.file;
    }

    return true;
  }

  findAndUpdateRecordingBlock(filePath: string, duration: number): boolean {
    const durationStr = formatDuration(duration);
    const title = this.recordingBlockFile?.basename || this.recordingFile?.basename || '未命名课程';
    const replacement = this.buildFinalEmbedBlock(filePath, title, durationStr);

    return this.replaceRecordingBlockInOpenEditors(replacement);
  }

  findAndRemoveRecordingBlock(): boolean {
    return this.replaceRecordingBlockInOpenEditors('');
  }

  /**
   * 在当前编辑器光标位置插入音频嵌入块
   * @param filePath 录音文件路径
   * @param duration 录音时长（毫秒），直接传入而非从 recorder 获取（此时已 cleanup）
   */
  insertEmbedBlockAtCursor(filePath: string, duration: number): void {
    const durationStr = formatDuration(duration);
    const context = this.resolveEditorContext(this.recordingFile);
    if (context) {
      const title = context.file?.basename || this.recordingFile?.basename || '未命名课程';
      this.doInsertEmbed(context.editor, filePath, title, durationStr);
      this.recordingFile = null;
      return;
    }

    // 最终 fallback：提示用户
    new Notice(`录音已保存到 ${filePath}，但无法自动插入嵌入块，请手动添加`);
    this.recordingFile = null;
  }

  /**
   * 执行嵌入块插入
   */
  private doInsertEmbed(
    editor: Editor,
    filePath: string,
    title: string,
    durationStr: string,
  ): void {
    const cursor = editor.getCursor();
    const embedBlock = ['', this.buildFinalEmbedBlock(filePath, title, durationStr), ''].join('\n');
    editor.replaceRange(embedBlock, cursor);
  }

  private buildRecordingPlaceholderBlock(title: string, blockId: string): string {
    return [
      '',
      `\`\`\`${AUDIO_EMBED_TYPE}`,
      'status: recording',
      `id: ${blockId}`,
      `title: ${title}`,
      '```',
      '',
    ].join('\n');
  }

  private buildFinalEmbedBlock(filePath: string, title: string, durationStr: string): string {
    return [
      `\`\`\`${AUDIO_EMBED_TYPE}`,
      `file: ${filePath}`,
      `title: ${title}`,
      `duration: ${durationStr}`,
      '```',
    ].join('\n');
  }

  private replaceRecordingBlockInOpenEditors(replacement: string): boolean {
    const preferredContext = this.resolveEditorContext(this.recordingBlockFile || this.recordingFile);
    if (preferredContext && this.replaceRecordingBlockInEditor(preferredContext.editor, replacement)) {
      return true;
    }

    const leaves = this.app.workspace.getLeavesOfType('markdown');
    for (const leaf of leaves) {
      if (!(leaf.view instanceof MarkdownView)) continue;
      const leafFile = leaf.view.file;
      if (preferredContext?.file?.path === leafFile?.path) continue;

      if (this.replaceRecordingBlockInEditor(leaf.view.editor, replacement)) {
        return true;
      }
    }

    // 编辑器不可用时（用户已切换笔记），通过 vault.process() 直接修改文件
    const targetFile = this.recordingBlockFile || this.recordingFile;
    if (targetFile) {
      return this.replaceRecordingBlockViaVault(targetFile, replacement);
    }

    return false;
  }

  /**
   * 通过 Vault API 直接修改文件内容中的录音占位块。
   * 当编辑器不可用时（例如用户已切换到其他笔记）作为兜底方案使用。
   */
  private replaceRecordingBlockViaVault(file: TFile, replacement: string): boolean {
    try {
      this.app.vault.process(file, (content) => {
        const range = this.findRecordingBlockRange(content);
        if (!range) {
          return content;
        }
        return content.slice(0, range.start) + replacement + content.slice(range.end);
      });
      return true;
    } catch (err) {
      console.error('Lecture Recorder: vault.process 更新录音块失败', err);
      return false;
    }
  }

  private replaceRecordingBlockInEditor(editor: Editor, replacement: string): boolean {
    const doc = editor.getValue();
    const range = this.findRecordingBlockRange(doc);
    if (!range) {
      return false;
    }

    const from = editor.offsetToPos(range.start);
    const to = editor.offsetToPos(range.end);
    editor.replaceRange(replacement, from, to);
    return true;
  }

  private findRecordingBlockRange(doc: string): { start: number; end: number } | null {
    const blockRegex = /```lecture-audio\s*\n([\s\S]*?)\n```/g;
    let match: RegExpExecArray | null;

    while ((match = blockRegex.exec(doc)) !== null) {
      const params = this.parseEmbedParams(match[1]);
      if (params.status !== 'recording') continue;

      // 优先匹配当前录音会话的占位块，避免误改历史块
      if (this.recordingBlockId && params.id !== this.recordingBlockId) continue;

      return {
        start: match.index,
        end: match.index + match[0].length,
      };
    }

    return null;
  }

  private parseEmbedParams(source: string): Record<string, string> {
    const params: Record<string, string> = {};

    source.split('\n').forEach((line) => {
      const match = line.match(/^([\w-]+):\s*(.*)$/);
      if (match) {
        params[match[1]] = match[2].trim();
      }
    });

    return params;
  }

  private async insertSummaryBelowEmbed(
    audioFilePath: string,
    summaryMarkdown: string,
    context: SummaryContext,
    preferredNotePath?: string,
  ): Promise<string | null> {
    const summaryBlock = this.buildSummaryMarkdown(audioFilePath, summaryMarkdown, context);
    const visitedPaths = new Set<string>();

    const candidateViews = this.collectMarkdownViewsByPriority(preferredNotePath);
    for (const view of candidateViews) {
      const file = view.file;
      if (!file || visitedPaths.has(file.path)) {
        continue;
      }
      visitedPaths.add(file.path);

      const changed = this.applySummaryToEditor(view.editor, audioFilePath, summaryBlock);
      if (changed) {
        return file.path;
      }
    }

    const preferredFile = this.resolveMarkdownFile(preferredNotePath);
    if (preferredFile && !visitedPaths.has(preferredFile.path)) {
      const changed = await this.applySummaryToVaultFile(preferredFile, audioFilePath, summaryBlock);
      if (changed) {
        return preferredFile.path;
      }
      visitedPaths.add(preferredFile.path);
    }

    const markdownFiles = this.app.vault.getMarkdownFiles();
    for (const file of markdownFiles) {
      if (visitedPaths.has(file.path)) {
        continue;
      }

      const changed = await this.applySummaryToVaultFile(file, audioFilePath, summaryBlock);
      if (changed) {
        return file.path;
      }
    }

    return null;
  }

  private applySummaryToEditor(
    editor: Editor,
    audioFilePath: string,
    summaryBlock: string,
  ): boolean {
    const doc = editor.getValue();
    const operation = this.buildSummaryUpsertOperation(doc, audioFilePath, summaryBlock);
    if (!operation) {
      return false;
    }

    const from = editor.offsetToPos(operation.start);
    const to = editor.offsetToPos(operation.end);
    editor.replaceRange(operation.text, from, to);
    return true;
  }

  private async applySummaryToVaultFile(
    file: TFile,
    audioFilePath: string,
    summaryBlock: string,
  ): Promise<boolean> {
    let changed = false;
    await this.app.vault.process(file, (content) => {
      const operation = this.buildSummaryUpsertOperation(content, audioFilePath, summaryBlock);
      if (!operation) {
        return content;
      }

      changed = true;
      return content.slice(0, operation.start) + operation.text + content.slice(operation.end);
    });
    return changed;
  }

  private buildSummaryUpsertOperation(
    doc: string,
    audioFilePath: string,
    summaryBlock: string,
  ): TextEditOperation | null {
    const summaryRange = this.findSummaryBlockRange(doc, audioFilePath);
    if (summaryRange) {
      return {
        start: summaryRange.start,
        end: summaryRange.end,
        text: summaryBlock,
      };
    }

    const embedMatch = this.findAudioEmbedBlock(doc, audioFilePath);
    if (!embedMatch) {
      return null;
    }

    const insertPos = embedMatch.range.end;
    const suffix = doc.slice(insertPos);
    const separator = suffix.startsWith('\n\n') ? '\n' : '\n\n';

    return {
      start: insertPos,
      end: insertPos,
      text: `${separator}${summaryBlock}`,
    };
  }

  private findSummaryBlockRange(doc: string, audioFilePath: string): TextRange | null {
    const startMarker = this.buildSummaryStartMarker(audioFilePath);
    const startIndex = doc.indexOf(startMarker);
    if (startIndex < 0) {
      return null;
    }

    const endMarker = '<!-- lecture-summary:end -->';
    const endIndex = doc.indexOf(endMarker, startIndex + startMarker.length);
    if (endIndex < 0) {
      return null;
    }

    return {
      start: startIndex,
      end: endIndex + endMarker.length,
    };
  }

  private findAudioEmbedBlock(doc: string, audioFilePath: string): AudioEmbedMatch | null {
    const blockRegex = /```lecture-audio\s*\n([\s\S]*?)\n```/g;
    let match: RegExpExecArray | null;

    while ((match = blockRegex.exec(doc)) !== null) {
      const params = this.parseEmbedParams(match[1]);
      if (params.file !== audioFilePath) {
        continue;
      }

      return {
        range: {
          start: match.index,
          end: match.index + match[0].length,
        },
        params,
      };
    }

    return null;
  }

  private buildSummaryMarkdown(
    audioFilePath: string,
    summaryMarkdown: string,
    context: SummaryContext,
    options?: { includeMarkers?: boolean },
  ): string {
    const normalizedSummary = summaryMarkdown.trim() || '（模型未返回纪要内容）';
    const generatedAt = this.formatDateTime(new Date());
    const includeMarkers = options?.includeMarkers ?? true;

    const lines = [
      '## 课堂纪要（AI）',
      '',
      `- 课程：${context.courseName}`,
      `- 日期：${context.date}`,
      `- 时长：${context.duration}`,
      `- 生成时间：${generatedAt}`,
      '',
      normalizedSummary,
    ];

    if (includeMarkers) {
      return [
        this.buildSummaryStartMarker(audioFilePath),
        ...lines,
        '',
        '<!-- lecture-summary:end -->',
      ].join('\n');
    }

    return lines.join('\n');
  }

  private buildSummaryStartMarker(audioFilePath: string): string {
    return `<!-- lecture-summary:start ${audioFilePath} -->`;
  }

  private getSummarySidecarPath(audioFilePath: string): string {
    return `${audioFilePath}.summary.md`;
  }

  private extractSummaryTextFromSidecar(content: string): string {
    const normalized = content.trim();
    if (!normalized) {
      return '';
    }

    const structured = normalized.match(/^##[^\n]*\n(?:\n)?(?:- [^\n]*\n)+\n([\s\S]*)$/);
    if (structured?.[1]) {
      return structured[1].trim();
    }

    return normalized;
  }

  private async saveSummarySidecar(
    audioFilePath: string,
    summaryMarkdown: string,
    context: SummaryContext,
  ): Promise<string> {
    const summaryPath = this.getSummarySidecarPath(audioFilePath);
    const content = this.buildSummaryMarkdown(audioFilePath, summaryMarkdown, context, {
      includeMarkers: false,
    });

    const existed = this.app.vault.getAbstractFileByPath(summaryPath);
    if (existed instanceof TFile) {
      await this.app.vault.modify(existed, content);
    } else {
      await this.app.vault.create(summaryPath, content);
    }

    return summaryPath;
  }

  private resolveMarkdownFile(filePath?: string): TFile | null {
    if (!filePath) {
      return null;
    }

    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file instanceof TFile && file.extension === 'md') {
      return file;
    }

    return null;
  }

  private collectMarkdownViewsByPriority(preferredNotePath?: string): MarkdownView[] {
    const views: MarkdownView[] = [];
    const seen = new Set<string>();

    const pushView = (view: MarkdownView | null) => {
      if (!view?.file) {
        return;
      }
      const key = view.file.path;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      views.push(view);
    };

    if (preferredNotePath) {
      const preferredLeaves = this.app.workspace.getLeavesOfType('markdown');
      for (const leaf of preferredLeaves) {
        if (
          leaf.view instanceof MarkdownView &&
          leaf.view.file?.path === preferredNotePath
        ) {
          pushView(leaf.view);
          break;
        }
      }
    }

    pushView(this.app.workspace.getActiveViewOfType(MarkdownView));

    const leaves = this.app.workspace.getLeavesOfType('markdown');
    for (const leaf of leaves) {
      if (leaf.view instanceof MarkdownView) {
        pushView(leaf.view);
      }
    }

    return views;
  }

  private extractFileStem(filePath: string): string {
    const fileName = filePath.split('/').pop() || filePath;
    const dotIndex = fileName.lastIndexOf('.');
    if (dotIndex <= 0) {
      return fileName;
    }
    return fileName.slice(0, dotIndex);
  }

  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private formatDateTime(date: Date): string {
    const datePart = this.formatDate(date);
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${datePart} ${hh}:${mm}:${ss}`;
  }

  private resolveEditorContext(preferredFile: TFile | null = null): EditorContext | null {
    const activeEditor = this.app.workspace.activeEditor;
    if (activeEditor?.editor) {
      const activeFile = activeEditor.file || null;
      if (!preferredFile || activeFile?.path === preferredFile.path) {
        return {
          editor: activeEditor.editor,
          file: activeFile,
        };
      }
    }

    const preferredPath = preferredFile?.path || null;
    if (preferredPath) {
      const leaves = this.app.workspace.getLeavesOfType('markdown');
      for (const leaf of leaves) {
        if (leaf.view instanceof MarkdownView && leaf.view.file?.path === preferredPath) {
          return {
            editor: leaf.view.editor,
            file: leaf.view.file,
          };
        }
      }
    }

    const activeMarkdown = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeMarkdown) {
      return {
        editor: activeMarkdown.editor,
        file: activeMarkdown.file || null,
      };
    }

    const leaves = this.app.workspace.getLeavesOfType('markdown');
    for (const leaf of leaves) {
      if (leaf.view instanceof MarkdownView) {
        return {
          editor: leaf.view.editor,
          file: leaf.view.file || null,
        };
      }
    }

    return null;
  }

  private createRecordingBlockId(): string {
    return `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
  }

  private clearRecordingBlockTracking(): void {
    this.recordingBlockId = null;
    this.recordingBlockFile = null;
  }
}
