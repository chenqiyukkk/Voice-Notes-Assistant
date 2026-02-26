import { App, PluginSettingTab, Setting } from 'obsidian';
import type LectureRecorderPlugin from './main';

type SettingsLocale = 'zh' | 'en';

const SETTINGS_TEXT = {
  zh: {
    title: '语音纪要助手',
    intro1: '适用于会议纪要、课堂总结、访谈整理等场景。',
    intro2: '快速上手：先配置“转写服务”和“AI 纪要服务”→ 开始录音 → 点击“转写录音/生成纪要”。',
    intro3: '如果你是第一次使用，推荐先使用默认设置，只填写 API Key。',
    languageName: '界面语言',
    languageDesc: '点击按钮切换插件语言，支持中文 / English。',
    languageZh: '中文',
    languageEn: 'English',
    sectionRecording: '1) 录音与文件保存',
    sectionTranscription: '2) 语音转写服务',
    sectionSummary: '3) AI 纪要生成',
    sectionAutomation: '4) 自动流程（推荐）',
    sectionTemplate: '5) 纪要模板（可选）',
    sectionAdvanced: '6) 高级优化（按需）',
    recordingStorageName: '录音文件保存位置',
    recordingStorageDesc: '录音文件会保存到你的 Vault 目录中（建议保持默认）',
    audioFormatName: '音频格式',
    audioFormatDesc: 'WAV 兼容性更好（推荐新手），WebM 体积更小',
    audioFormatWebm: 'WebM (Opus)',
    audioFormatWav: 'WAV',
    audioQualityName: '音频质量',
    audioQualityDesc: '更高质量 = 更清晰，但文件更大',
    audioQualityLow: '低 (64kbps)',
    audioQualityStandard: '标准 (128kbps)',
    audioQualityHigh: '高 (256kbps)',
    transcriptionProviderName: '转写服务',
    transcriptionProviderDesc: '将音频转成文字。会议和课堂都建议先选一个服务并完成配置',
    providerWhisper: 'OpenAI Whisper（稳定通用）',
    providerXfyun: '科大讯飞（中文场景表现好）',
    providerLocalWhisper: '本地 Whisper（离线与隐私优先）',
    transcriptionLanguageName: '转写语言',
    transcriptionLanguageDesc: '请选择会议/课堂中的主要语言，auto 为自动检测',
    languageOptionZh: '中文',
    languageOptionEn: '英文',
    languageOptionAuto: '自动检测',
    summaryProviderName: '纪要服务',
    summaryProviderDesc: '将转写内容整理为结构化纪要（核心要点、术语、复习建议等）',
    summaryProviderOpenAI: 'OpenAI 兼容 (OpenAI/DeepSeek/硅基流动等)',
    summaryProviderClaude: 'Claude (Anthropic)',
    autoTranscribeName: '自动转写',
    autoTranscribeDesc: '录音结束后自动开始语音转写',
    autoSummarizeName: '自动生成纪要',
    autoSummarizeDesc: '转写完成后自动生成会议/课堂纪要',
    customTemplateName: '自定义提示词模板',
    customTemplateDesc: '可用占位符：{{courseName}} / {{date}} / {{duration}}。留空使用内置模板',
    customTemplatePlaceholder: '留空使用默认模板...',
    hierarchicalName: '长文本分段总结',
    hierarchicalDesc: '长会议/长课堂推荐开启：先分段总结，再合并最终纪要',
    chunkLimitName: '分段阈值（字符）',
    chunkLimitDesc: '超过该长度触发分段总结。内容越长可适当调低',
    waveformEnabledName: '启用音频波形',
    waveformEnabledDesc: '显示波形，便于快速定位关键片段（会议讨论点/课堂重点）',
    waveformMaxName: '波形最大文件大小（MB）',
    waveformMaxDesc: '超过该大小不再渲染波形，避免卡顿',
    whisperHeader: 'OpenAI Whisper 配置（语音转写）',
    xfyunHeader: '科大讯飞配置（语音转写）',
    localWhisperHeader: '本地 Whisper 配置（离线转写）',
    openAICompatHeader: 'OpenAI 兼容 API 配置（AI 纪要）',
    claudeHeader: 'Claude API 配置（AI 纪要）',
    apiKeyName: 'API Key',
    apiBaseName: 'API Base URL',
    modelName: '模型名称',
    whisperApiKeyDesc: '用于调用转写接口（仅 API 计费，不是 ChatGPT Plus）',
    whisperApiBaseDesc: '默认 OpenAI，或填写兼容地址（代理/第三方平台）',
    whisperModelDesc: '一般保持 whisper-1 即可',
    xfyunAppIdName: 'App ID',
    xfyunAppIdDesc: '在讯飞开放平台创建应用后获取',
    xfyunSecretName: 'Secret Key',
    xfyunDesc1: '讯飞开放平台: https://www.xfyun.cn/',
    xfyunDesc2: '新用户可获得 50 小时免费转写额度',
    localWhisperCppName: 'whisper.cpp 路径',
    localWhisperCppDesc: 'whisper.cpp 可执行文件完整路径（如 whisper-cli.exe）',
    localWhisperModelPathName: '模型文件路径',
    localWhisperModelPathDesc: 'GGML 模型路径（推荐 base/small，精度与速度更平衡）',
    localWhisperThreadsName: 'CPU 线程数',
    localWhisperThreadsDesc: '更多线程 = 更快转写，但也更占系统资源',
    localWhisperDesc1: 'whisper.cpp: https://github.com/ggerganov/whisper.cpp/releases',
    localWhisperDesc2: '模型下载: https://huggingface.co/ggerganov/whisper.cpp',
    localWhisperDesc3: '推荐: base (~142MB) 或 small (~466MB)',
    openAICompatApiKeyDesc: '用于纪要生成（支持 OpenAI/DeepSeek/硅基流动等）',
    openAICompatApiBaseDesc: 'OpenAI / DeepSeek / 硅基流动等的 API 地址',
    openAICompatModelDesc: '示例：gpt-4o / deepseek-chat / glm-4',
    claudeApiKeyDesc: 'Anthropic API Key（API 独立计费，非 Claude Pro）',
  },
  en: {
    title: 'Voice Notes Assistant',
    intro1: 'Designed for meeting notes, class summaries, and interview organization.',
    intro2: 'Quick start: configure "Transcription Service" and "AI Summary Service" -> start recording -> click "Transcribe/Summarize".',
    intro3: 'For first-time use, keep defaults and only fill in API keys.',
    languageName: 'UI Language',
    languageDesc: 'Switch plugin language with buttons. Supports Chinese / English.',
    languageZh: '中文',
    languageEn: 'English',
    sectionRecording: '1) Recording & Storage',
    sectionTranscription: '2) Transcription Service',
    sectionSummary: '3) AI Summarization',
    sectionAutomation: '4) Automation (Recommended)',
    sectionTemplate: '5) Summary Template (Optional)',
    sectionAdvanced: '6) Advanced Optimization',
    recordingStorageName: 'Recording Storage Path',
    recordingStorageDesc: 'Recordings are saved inside your vault (default recommended).',
    audioFormatName: 'Audio Format',
    audioFormatDesc: 'WAV has better compatibility; WebM produces smaller files.',
    audioFormatWebm: 'WebM (Opus)',
    audioFormatWav: 'WAV',
    audioQualityName: 'Audio Quality',
    audioQualityDesc: 'Higher quality means clearer sound but larger files.',
    audioQualityLow: 'Low (64kbps)',
    audioQualityStandard: 'Standard (128kbps)',
    audioQualityHigh: 'High (256kbps)',
    transcriptionProviderName: 'Transcription Provider',
    transcriptionProviderDesc: 'Convert audio to text. Choose one provider and complete configuration first.',
    providerWhisper: 'OpenAI Whisper (stable & general)',
    providerXfyun: 'iFLYTEK (strong in Chinese)',
    providerLocalWhisper: 'Local Whisper (offline & privacy-first)',
    transcriptionLanguageName: 'Transcription Language',
    transcriptionLanguageDesc: 'Select the primary spoken language. "auto" detects automatically.',
    languageOptionZh: 'Chinese',
    languageOptionEn: 'English',
    languageOptionAuto: 'Auto Detect',
    summaryProviderName: 'Summary Provider',
    summaryProviderDesc: 'Organize transcript into structured notes (key points, terms, review suggestions).',
    summaryProviderOpenAI: 'OpenAI-compatible (OpenAI/DeepSeek/SiliconFlow, etc.)',
    summaryProviderClaude: 'Claude (Anthropic)',
    autoTranscribeName: 'Auto Transcribe',
    autoTranscribeDesc: 'Automatically transcribe after recording ends.',
    autoSummarizeName: 'Auto Summarize',
    autoSummarizeDesc: 'Automatically generate summary after transcription completes.',
    customTemplateName: 'Custom Prompt Template',
    customTemplateDesc: 'Available placeholders: {{courseName}} / {{date}} / {{duration}}. Leave empty for default template.',
    customTemplatePlaceholder: 'Leave empty to use default template...',
    hierarchicalName: 'Hierarchical Summarization',
    hierarchicalDesc: 'Recommended for long sessions: summarize chunks first, then merge.',
    chunkLimitName: 'Chunk Threshold (chars)',
    chunkLimitDesc: 'Chunk summarization starts when transcript exceeds this length.',
    waveformEnabledName: 'Enable Waveform',
    waveformEnabledDesc: 'Display waveform to quickly locate key moments.',
    waveformMaxName: 'Waveform Max File Size (MB)',
    waveformMaxDesc: 'Skip waveform rendering above this size to avoid lag.',
    whisperHeader: 'OpenAI Whisper Settings (Transcription)',
    xfyunHeader: 'iFLYTEK Settings (Transcription)',
    localWhisperHeader: 'Local Whisper Settings (Offline)',
    openAICompatHeader: 'OpenAI-Compatible API Settings (Summary)',
    claudeHeader: 'Claude API Settings (Summary)',
    apiKeyName: 'API Key',
    apiBaseName: 'API Base URL',
    modelName: 'Model Name',
    whisperApiKeyDesc: 'Used for transcription API calls (API billing only, not ChatGPT Plus).',
    whisperApiBaseDesc: 'Default OpenAI endpoint, or use any compatible endpoint.',
    whisperModelDesc: 'Usually keep whisper-1.',
    xfyunAppIdName: 'App ID',
    xfyunAppIdDesc: 'Get it after creating an app on iFLYTEK Open Platform.',
    xfyunSecretName: 'Secret Key',
    xfyunDesc1: 'iFLYTEK Open Platform: https://www.xfyun.cn/',
    xfyunDesc2: 'New users may get 50 hours free quota.',
    localWhisperCppName: 'whisper.cpp Path',
    localWhisperCppDesc: 'Full path to whisper.cpp executable (e.g. whisper-cli.exe).',
    localWhisperModelPathName: 'Model File Path',
    localWhisperModelPathDesc: 'GGML model path (base/small recommended for balance).',
    localWhisperThreadsName: 'CPU Threads',
    localWhisperThreadsDesc: 'More threads = faster transcription, but higher resource usage.',
    localWhisperDesc1: 'whisper.cpp: https://github.com/ggerganov/whisper.cpp/releases',
    localWhisperDesc2: 'Model download: https://huggingface.co/ggerganov/whisper.cpp',
    localWhisperDesc3: 'Recommended: base (~142MB) or small (~466MB)',
    openAICompatApiKeyDesc: 'Used for summary generation (OpenAI/DeepSeek/SiliconFlow, etc.)',
    openAICompatApiBaseDesc: 'API endpoint for OpenAI / DeepSeek / SiliconFlow, etc.',
    openAICompatModelDesc: 'Example: gpt-4o / deepseek-chat / glm-4',
    claudeApiKeyDesc: 'Anthropic API key (separate API billing, not Claude Pro).',
  },
} as const;

type SettingsTextKey = keyof typeof SETTINGS_TEXT.zh;

export interface LectureRecorderSettings {
  // 录音
  recordingStoragePath: string;
  audioFormat: 'webm' | 'wav';
  audioQuality: 'low' | 'standard' | 'high';

  // 转写 - 通用
  transcriptionProvider: 'whisper' | 'xfyun' | 'local-whisper';
  transcriptionLanguage: string;

  // 转写 - Whisper
  whisperApiKey: string;
  whisperApiBaseUrl: string;
  whisperModel: string;

  // 转写 - 讯飞
  xfyunAppId: string;
  xfyunSecretKey: string;

  // 转写 - 本地
  whisperCppPath: string;
  whisperModelPath: string;
  whisperThreads: number;

  // 总结 - 通用
  summaryProvider: 'openai-compat' | 'claude';

  // 总结 - OpenAI 兼容
  llmApiKey: string;
  llmApiBaseUrl: string;
  llmModel: string;

  // 总结 - Claude
  claudeApiKey: string;
  claudeModel: string;

  // 模板与自动化
  summaryTemplate: string;
  autoTranscribe: boolean;
  autoSummarize: boolean;

  // Phase 5 - 总结优化
  summaryEnableHierarchical: boolean;
  summaryChunkCharLimit: number;

  // Phase 5 - 播放优化
  waveformEnabled: boolean;
  waveformMaxFileSizeMB: number;

  // Phase 5 - 国际化
  uiLanguage: 'zh' | 'en';
}

export const DEFAULT_SETTINGS: LectureRecorderSettings = {
  recordingStoragePath: 'recordings',
  audioFormat: 'wav',
  audioQuality: 'standard',

  transcriptionProvider: 'whisper',
  transcriptionLanguage: 'zh',

  whisperApiKey: '',
  whisperApiBaseUrl: 'https://api.openai.com/v1',
  whisperModel: 'whisper-1',

  xfyunAppId: '',
  xfyunSecretKey: '',

  whisperCppPath: '',
  whisperModelPath: '',
  whisperThreads: 4,

  summaryProvider: 'openai-compat',

  llmApiKey: '',
  llmApiBaseUrl: 'https://api.openai.com/v1',
  llmModel: 'gpt-4o',

  claudeApiKey: '',
  claudeModel: 'claude-sonnet-4-5-20250929',

  summaryTemplate: '',
  autoTranscribe: false,
  autoSummarize: false,

  summaryEnableHierarchical: true,
  summaryChunkCharLimit: 12000,

  waveformEnabled: true,
  waveformMaxFileSizeMB: 50,

  uiLanguage: 'zh',
};

export class LectureRecorderSettingTab extends PluginSettingTab {
  plugin: LectureRecorderPlugin;

  constructor(app: App, plugin: LectureRecorderPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h1', { text: this.tr('title') });
    const intro = containerEl.createEl('div', { cls: 'setting-item-description' });
    intro.createEl('p', { text: this.tr('intro1') });
    intro.createEl('p', { text: this.tr('intro2') });
    intro.createEl('p', { text: this.tr('intro3') });

    const languageSetting = new Setting(containerEl)
      .setName(this.tr('languageName'))
      .setDesc(this.tr('languageDesc'));
    this.addLanguageButton(languageSetting, 'zh', this.tr('languageZh'));
    this.addLanguageButton(languageSetting, 'en', this.tr('languageEn'));

    // ==================== 录音设置 ====================
    containerEl.createEl('h2', { text: this.tr('sectionRecording') });

    new Setting(containerEl)
      .setName(this.tr('recordingStorageName'))
      .setDesc(this.tr('recordingStorageDesc'))
      .addText(text => text
        .setPlaceholder('recordings')
        .setValue(this.plugin.settings.recordingStoragePath)
        .onChange(async (value) => {
          this.plugin.settings.recordingStoragePath = value || 'recordings';
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(this.tr('audioFormatName'))
      .setDesc(this.tr('audioFormatDesc'))
      .addDropdown(dropdown => dropdown
        .addOption('webm', this.tr('audioFormatWebm'))
        .addOption('wav', this.tr('audioFormatWav'))
        .setValue(this.plugin.settings.audioFormat)
        .onChange(async (value: string) => {
          this.plugin.settings.audioFormat = value as 'webm' | 'wav';
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(this.tr('audioQualityName'))
      .setDesc(this.tr('audioQualityDesc'))
      .addDropdown(dropdown => dropdown
        .addOption('low', this.tr('audioQualityLow'))
        .addOption('standard', this.tr('audioQualityStandard'))
        .addOption('high', this.tr('audioQualityHigh'))
        .setValue(this.plugin.settings.audioQuality)
        .onChange(async (value: string) => {
          this.plugin.settings.audioQuality = value as 'low' | 'standard' | 'high';
          await this.plugin.saveSettings();
        }));

    // ==================== 语音转写设置 ====================
    containerEl.createEl('h2', { text: this.tr('sectionTranscription') });

    new Setting(containerEl)
      .setName(this.tr('transcriptionProviderName'))
      .setDesc(this.tr('transcriptionProviderDesc'))
      .addDropdown(dropdown => dropdown
        .addOption('whisper', this.tr('providerWhisper'))
        .addOption('xfyun', this.tr('providerXfyun'))
        .addOption('local-whisper', this.tr('providerLocalWhisper'))
        .setValue(this.plugin.settings.transcriptionProvider)
        .onChange(async (value: string) => {
          this.plugin.settings.transcriptionProvider = value as 'whisper' | 'xfyun' | 'local-whisper';
          await this.plugin.saveSettings();
          this.display();
        }));

    new Setting(containerEl)
      .setName(this.tr('transcriptionLanguageName'))
      .setDesc(this.tr('transcriptionLanguageDesc'))
      .addDropdown(dropdown => dropdown
        .addOption('zh', this.tr('languageOptionZh'))
        .addOption('en', this.tr('languageOptionEn'))
        .addOption('auto', this.tr('languageOptionAuto'))
        .setValue(this.plugin.settings.transcriptionLanguage)
        .onChange(async (value: string) => {
          this.plugin.settings.transcriptionLanguage = value;
          await this.plugin.saveSettings();
        }));

    // 根据选中的 Provider 显示对应配置
    const provider = this.plugin.settings.transcriptionProvider;
    if (provider === 'whisper') {
      this.displayWhisperSettings(containerEl);
    } else if (provider === 'xfyun') {
      this.displayXfyunSettings(containerEl);
    } else if (provider === 'local-whisper') {
      this.displayLocalWhisperSettings(containerEl);
    }

    // ==================== AI 总结设置 ====================
    containerEl.createEl('h2', { text: this.tr('sectionSummary') });

    new Setting(containerEl)
      .setName(this.tr('summaryProviderName'))
      .setDesc(this.tr('summaryProviderDesc'))
      .addDropdown(dropdown => dropdown
        .addOption('openai-compat', this.tr('summaryProviderOpenAI'))
        .addOption('claude', this.tr('summaryProviderClaude'))
        .setValue(this.plugin.settings.summaryProvider)
        .onChange(async (value: string) => {
          this.plugin.settings.summaryProvider = value as 'openai-compat' | 'claude';
          await this.plugin.saveSettings();
          this.display();
        }));

    if (this.plugin.settings.summaryProvider === 'openai-compat') {
      this.displayOpenAICompatSettings(containerEl);
    } else {
      this.displayClaudeSettings(containerEl);
    }

    // ==================== 自动化设置 ====================
    containerEl.createEl('h2', { text: this.tr('sectionAutomation') });

    new Setting(containerEl)
      .setName(this.tr('autoTranscribeName'))
      .setDesc(this.tr('autoTranscribeDesc'))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.autoTranscribe)
        .onChange(async (value) => {
          this.plugin.settings.autoTranscribe = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(this.tr('autoSummarizeName'))
      .setDesc(this.tr('autoSummarizeDesc'))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.autoSummarize)
        .onChange(async (value) => {
          this.plugin.settings.autoSummarize = value;
          await this.plugin.saveSettings();
        }));

    // ==================== 自定义模板 ====================
    containerEl.createEl('h2', { text: this.tr('sectionTemplate') });

    new Setting(containerEl)
      .setName(this.tr('customTemplateName'))
      .setDesc(this.tr('customTemplateDesc'))
      .addTextArea(text => {
        text
          .setPlaceholder(this.tr('customTemplatePlaceholder'))
          .setValue(this.plugin.settings.summaryTemplate)
          .onChange(async (value) => {
            this.plugin.settings.summaryTemplate = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 8;
        text.inputEl.cols = 50;
      });

    // ==================== Phase 5 设置 ====================
    containerEl.createEl('h2', { text: this.tr('sectionAdvanced') });

    new Setting(containerEl)
      .setName(this.tr('hierarchicalName'))
      .setDesc(this.tr('hierarchicalDesc'))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.summaryEnableHierarchical)
        .onChange(async (value) => {
          this.plugin.settings.summaryEnableHierarchical = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(this.tr('chunkLimitName'))
      .setDesc(this.tr('chunkLimitDesc'))
      .addSlider(slider => slider
        .setLimits(4000, 30000, 1000)
        .setValue(this.plugin.settings.summaryChunkCharLimit)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.summaryChunkCharLimit = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(this.tr('waveformEnabledName'))
      .setDesc(this.tr('waveformEnabledDesc'))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.waveformEnabled)
        .onChange(async (value) => {
          this.plugin.settings.waveformEnabled = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(this.tr('waveformMaxName'))
      .setDesc(this.tr('waveformMaxDesc'))
      .addSlider(slider => slider
        .setLimits(10, 200, 5)
        .setValue(this.plugin.settings.waveformMaxFileSizeMB)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.waveformMaxFileSizeMB = value;
          await this.plugin.saveSettings();
        }));
  }

  private displayWhisperSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: this.tr('whisperHeader') });

    new Setting(containerEl)
      .setName(this.tr('apiKeyName'))
      .setDesc(this.tr('whisperApiKeyDesc'))
      .addText(text => {
        text
          .setPlaceholder('sk-...')
          .setValue(this.plugin.settings.whisperApiKey)
          .onChange(async (value) => {
            this.plugin.settings.whisperApiKey = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
      });

    new Setting(containerEl)
      .setName(this.tr('apiBaseName'))
      .setDesc(this.tr('whisperApiBaseDesc'))
      .addText(text => text
        .setPlaceholder('https://api.openai.com/v1')
        .setValue(this.plugin.settings.whisperApiBaseUrl)
        .onChange(async (value) => {
          this.plugin.settings.whisperApiBaseUrl = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(this.tr('modelName'))
      .setDesc(this.tr('whisperModelDesc'))
      .addText(text => text
        .setPlaceholder('whisper-1')
        .setValue(this.plugin.settings.whisperModel)
        .onChange(async (value) => {
          this.plugin.settings.whisperModel = value;
          await this.plugin.saveSettings();
        }));
  }

  private displayXfyunSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: this.tr('xfyunHeader') });

    new Setting(containerEl)
      .setName(this.tr('xfyunAppIdName'))
      .setDesc(this.tr('xfyunAppIdDesc'))
      .addText(text => text
        .setValue(this.plugin.settings.xfyunAppId)
        .onChange(async (value) => {
          this.plugin.settings.xfyunAppId = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(this.tr('xfyunSecretName'))
      .addText(text => {
        text
          .setValue(this.plugin.settings.xfyunSecretKey)
          .onChange(async (value) => {
            this.plugin.settings.xfyunSecretKey = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
      });

    const descEl = containerEl.createEl('div', { cls: 'setting-item-description' });
    descEl.createEl('p', { text: this.tr('xfyunDesc1') });
    descEl.createEl('p', { text: this.tr('xfyunDesc2') });
  }

  private displayLocalWhisperSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: this.tr('localWhisperHeader') });

    new Setting(containerEl)
      .setName(this.tr('localWhisperCppName'))
      .setDesc(this.tr('localWhisperCppDesc'))
      .addText(text => text
        .setPlaceholder('D:/project/whisper.cpp/Release/whisper-cli.exe')
        .setValue(this.plugin.settings.whisperCppPath)
        .onChange(async (value) => {
          this.plugin.settings.whisperCppPath = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(this.tr('localWhisperModelPathName'))
      .setDesc(this.tr('localWhisperModelPathDesc'))
      .addText(text => text
        .setPlaceholder('D:/project/whisper.cpp/models/ggml-base.bin')
        .setValue(this.plugin.settings.whisperModelPath)
        .onChange(async (value) => {
          this.plugin.settings.whisperModelPath = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(this.tr('localWhisperThreadsName'))
      .setDesc(this.tr('localWhisperThreadsDesc'))
      .addSlider(slider => slider
        .setLimits(1, 16, 1)
        .setValue(this.plugin.settings.whisperThreads)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.whisperThreads = value;
          await this.plugin.saveSettings();
        }));

    const descEl = containerEl.createEl('div', { cls: 'setting-item-description' });
    descEl.createEl('p', { text: this.tr('localWhisperDesc1') });
    descEl.createEl('p', { text: this.tr('localWhisperDesc2') });
    descEl.createEl('p', { text: this.tr('localWhisperDesc3') });
  }

  private displayOpenAICompatSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: this.tr('openAICompatHeader') });

    new Setting(containerEl)
      .setName(this.tr('apiKeyName'))
      .setDesc(this.tr('openAICompatApiKeyDesc'))
      .addText(text => {
        text
          .setPlaceholder('sk-...')
          .setValue(this.plugin.settings.llmApiKey)
          .onChange(async (value) => {
            this.plugin.settings.llmApiKey = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
      });

    new Setting(containerEl)
      .setName(this.tr('apiBaseName'))
      .setDesc(this.tr('openAICompatApiBaseDesc'))
      .addText(text => text
        .setPlaceholder('https://api.openai.com/v1')
        .setValue(this.plugin.settings.llmApiBaseUrl)
        .onChange(async (value) => {
          this.plugin.settings.llmApiBaseUrl = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(this.tr('modelName'))
      .setDesc(this.tr('openAICompatModelDesc'))
      .addText(text => text
        .setPlaceholder('gpt-4o')
        .setValue(this.plugin.settings.llmModel)
        .onChange(async (value) => {
          this.plugin.settings.llmModel = value;
          await this.plugin.saveSettings();
        }));
  }

  private displayClaudeSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: this.tr('claudeHeader') });

    new Setting(containerEl)
      .setName(this.tr('apiKeyName'))
      .setDesc(this.tr('claudeApiKeyDesc'))
      .addText(text => {
        text
          .setPlaceholder('sk-ant-...')
          .setValue(this.plugin.settings.claudeApiKey)
          .onChange(async (value) => {
            this.plugin.settings.claudeApiKey = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
      });

    new Setting(containerEl)
      .setName(this.tr('modelName'))
      .addText(text => text
        .setPlaceholder('claude-sonnet-4-5-20250929')
        .setValue(this.plugin.settings.claudeModel)
        .onChange(async (value) => {
          this.plugin.settings.claudeModel = value;
          await this.plugin.saveSettings();
        }));
  }

  private addLanguageButton(
    setting: Setting,
    locale: SettingsLocale,
    label: string,
  ): void {
    setting.addButton((button) => {
      button.setButtonText(label);
      if (this.locale() === locale) {
        button.setCta();
      }
      button.onClick(async () => {
        if (this.locale() === locale) {
          return;
        }
        this.plugin.settings.uiLanguage = locale;
        await this.plugin.saveSettings();
        this.display();
      });
    });
  }

  private locale(): SettingsLocale {
    return this.plugin.settings.uiLanguage === 'en' ? 'en' : 'zh';
  }

  private tr(key: SettingsTextKey): string {
    const locale = this.locale();
    return SETTINGS_TEXT[locale][key] || SETTINGS_TEXT.zh[key];
  }
}
