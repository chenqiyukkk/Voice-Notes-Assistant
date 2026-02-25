import { App, PluginSettingTab, Setting } from 'obsidian';
import type LectureRecorderPlugin from './main';

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

    containerEl.createEl('h1', { text: '语音纪要助手' });
    const intro = containerEl.createEl('div', { cls: 'setting-item-description' });
    intro.createEl('p', { text: '适用于会议纪要、课堂总结、访谈整理等场景。' });
    intro.createEl('p', { text: '快速上手：先配置“转写服务”和“AI 纪要服务”→ 开始录音 → 点击“转写录音/生成纪要”。' });
    intro.createEl('p', { text: '如果你是第一次使用，推荐先使用默认设置，只填写 API Key。' });

    // ==================== 录音设置 ====================
    containerEl.createEl('h2', { text: '1) 录音与文件保存' });

    new Setting(containerEl)
      .setName('录音文件保存位置')
      .setDesc('录音文件会保存到你的 Vault 目录中（建议保持默认）')
      .addText(text => text
        .setPlaceholder('recordings')
        .setValue(this.plugin.settings.recordingStoragePath)
        .onChange(async (value) => {
          this.plugin.settings.recordingStoragePath = value || 'recordings';
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('音频格式')
      .setDesc('WAV 兼容性更好（推荐新手），WebM 体积更小')
      .addDropdown(dropdown => dropdown
        .addOption('webm', 'WebM (Opus)')
        .addOption('wav', 'WAV')
        .setValue(this.plugin.settings.audioFormat)
        .onChange(async (value: string) => {
          this.plugin.settings.audioFormat = value as 'webm' | 'wav';
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('音频质量')
      .setDesc('更高质量 = 更清晰，但文件更大')
      .addDropdown(dropdown => dropdown
        .addOption('low', '低 (64kbps)')
        .addOption('standard', '标准 (128kbps)')
        .addOption('high', '高 (256kbps)')
        .setValue(this.plugin.settings.audioQuality)
        .onChange(async (value: string) => {
          this.plugin.settings.audioQuality = value as 'low' | 'standard' | 'high';
          await this.plugin.saveSettings();
        }));

    // ==================== 语音转写设置 ====================
    containerEl.createEl('h2', { text: '2) 语音转写服务' });

    new Setting(containerEl)
      .setName('转写服务')
      .setDesc('将音频转成文字。会议和课堂都建议先选一个服务并完成配置')
      .addDropdown(dropdown => dropdown
        .addOption('whisper', 'OpenAI Whisper（稳定通用）')
        .addOption('xfyun', '科大讯飞（中文场景表现好）')
        .addOption('local-whisper', '本地 Whisper（离线与隐私优先）')
        .setValue(this.plugin.settings.transcriptionProvider)
        .onChange(async (value: string) => {
          this.plugin.settings.transcriptionProvider = value as 'whisper' | 'xfyun' | 'local-whisper';
          await this.plugin.saveSettings();
          this.display();
        }));

    new Setting(containerEl)
      .setName('转写语言')
      .setDesc('请选择会议/课堂中的主要语言，auto 为自动检测')
      .addDropdown(dropdown => dropdown
        .addOption('zh', '中文')
        .addOption('en', '英文')
        .addOption('auto', '自动检测')
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
    containerEl.createEl('h2', { text: '3) AI 纪要生成' });

    new Setting(containerEl)
      .setName('纪要服务')
      .setDesc('将转写内容整理为结构化纪要（核心要点、术语、复习建议等）')
      .addDropdown(dropdown => dropdown
        .addOption('openai-compat', 'OpenAI 兼容 (OpenAI/DeepSeek/硅基流动等)')
        .addOption('claude', 'Claude (Anthropic)')
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
    containerEl.createEl('h2', { text: '4) 自动流程（推荐）' });

    new Setting(containerEl)
      .setName('自动转写')
      .setDesc('录音结束后自动开始语音转写')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.autoTranscribe)
        .onChange(async (value) => {
          this.plugin.settings.autoTranscribe = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('自动生成纪要')
      .setDesc('转写完成后自动生成会议/课堂纪要')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.autoSummarize)
        .onChange(async (value) => {
          this.plugin.settings.autoSummarize = value;
          await this.plugin.saveSettings();
        }));

    // ==================== 自定义模板 ====================
    containerEl.createEl('h2', { text: '5) 纪要模板（可选）' });

    new Setting(containerEl)
      .setName('自定义提示词模板')
      .setDesc('可用占位符：{{courseName}} / {{date}} / {{duration}}。留空使用内置模板')
      .addTextArea(text => {
        text
          .setPlaceholder('留空使用默认模板...')
          .setValue(this.plugin.settings.summaryTemplate)
          .onChange(async (value) => {
            this.plugin.settings.summaryTemplate = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 8;
        text.inputEl.cols = 50;
      });

    // ==================== Phase 5 设置 ====================
    containerEl.createEl('h2', { text: '6) 高级优化（按需）' });

    new Setting(containerEl)
      .setName('长文本分段总结')
      .setDesc('长会议/长课堂推荐开启：先分段总结，再合并最终纪要')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.summaryEnableHierarchical)
        .onChange(async (value) => {
          this.plugin.settings.summaryEnableHierarchical = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('分段阈值（字符）')
      .setDesc('超过该长度触发分段总结。内容越长可适当调低')
      .addSlider(slider => slider
        .setLimits(4000, 30000, 1000)
        .setValue(this.plugin.settings.summaryChunkCharLimit)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.summaryChunkCharLimit = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('启用音频波形')
      .setDesc('显示波形，便于快速定位关键片段（会议讨论点/课堂重点）')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.waveformEnabled)
        .onChange(async (value) => {
          this.plugin.settings.waveformEnabled = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('波形最大文件大小（MB）')
      .setDesc('超过该大小不再渲染波形，避免卡顿')
      .addSlider(slider => slider
        .setLimits(10, 200, 5)
        .setValue(this.plugin.settings.waveformMaxFileSizeMB)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.waveformMaxFileSizeMB = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('界面语言')
      .setDesc('设置插件界面显示语言（目前主要覆盖录音管理面板）')
      .addDropdown(dropdown => dropdown
        .addOption('zh', '中文')
        .addOption('en', 'English')
        .setValue(this.plugin.settings.uiLanguage)
        .onChange(async (value: string) => {
          this.plugin.settings.uiLanguage = value as 'zh' | 'en';
          await this.plugin.saveSettings();
        }));
  }

  private displayWhisperSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'OpenAI Whisper 配置（语音转写）' });

    new Setting(containerEl)
      .setName('API Key')
      .setDesc('用于调用转写接口（仅 API 计费，不是 ChatGPT Plus）')
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
      .setName('API Base URL')
      .setDesc('默认 OpenAI，或填写兼容地址（代理/第三方平台）')
      .addText(text => text
        .setPlaceholder('https://api.openai.com/v1')
        .setValue(this.plugin.settings.whisperApiBaseUrl)
        .onChange(async (value) => {
          this.plugin.settings.whisperApiBaseUrl = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('模型')
      .setDesc('一般保持 whisper-1 即可')
      .addText(text => text
        .setPlaceholder('whisper-1')
        .setValue(this.plugin.settings.whisperModel)
        .onChange(async (value) => {
          this.plugin.settings.whisperModel = value;
          await this.plugin.saveSettings();
        }));
  }

  private displayXfyunSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: '科大讯飞配置（语音转写）' });

    new Setting(containerEl)
      .setName('App ID')
      .setDesc('在讯飞开放平台创建应用后获取')
      .addText(text => text
        .setValue(this.plugin.settings.xfyunAppId)
        .onChange(async (value) => {
          this.plugin.settings.xfyunAppId = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Secret Key')
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
    descEl.createEl('p', { text: '讯飞开放平台: https://www.xfyun.cn/' });
    descEl.createEl('p', { text: '新用户可获得 50 小时免费转写额度' });
  }

  private displayLocalWhisperSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: '本地 Whisper 配置（离线转写）' });

    new Setting(containerEl)
      .setName('whisper.cpp 路径')
      .setDesc('whisper.cpp 可执行文件完整路径（如 whisper-cli.exe）')
      .addText(text => text
        .setPlaceholder('D:/project/whisper.cpp/Release/whisper-cli.exe')
        .setValue(this.plugin.settings.whisperCppPath)
        .onChange(async (value) => {
          this.plugin.settings.whisperCppPath = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('模型文件路径')
      .setDesc('GGML 模型路径（推荐 base/small，精度与速度更平衡）')
      .addText(text => text
        .setPlaceholder('D:/project/whisper.cpp/models/ggml-base.bin')
        .setValue(this.plugin.settings.whisperModelPath)
        .onChange(async (value) => {
          this.plugin.settings.whisperModelPath = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('CPU 线程数')
      .setDesc('更多线程 = 更快转写，但也更占系统资源')
      .addSlider(slider => slider
        .setLimits(1, 16, 1)
        .setValue(this.plugin.settings.whisperThreads)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.whisperThreads = value;
          await this.plugin.saveSettings();
        }));

    const descEl = containerEl.createEl('div', { cls: 'setting-item-description' });
    descEl.createEl('p', { text: 'whisper.cpp: https://github.com/ggerganov/whisper.cpp/releases' });
    descEl.createEl('p', { text: '模型下载: https://huggingface.co/ggerganov/whisper.cpp' });
    descEl.createEl('p', { text: '推荐: base (~142MB) 或 small (~466MB)' });
  }

  private displayOpenAICompatSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'OpenAI 兼容 API 配置（AI 纪要）' });

    new Setting(containerEl)
      .setName('API Key')
      .setDesc('用于纪要生成（支持 OpenAI/DeepSeek/硅基流动等）')
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
      .setName('API Base URL')
      .setDesc('OpenAI / DeepSeek / 硅基流动等的 API 地址')
      .addText(text => text
        .setPlaceholder('https://api.openai.com/v1')
        .setValue(this.plugin.settings.llmApiBaseUrl)
        .onChange(async (value) => {
          this.plugin.settings.llmApiBaseUrl = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('模型名称')
      .setDesc('示例：gpt-4o / deepseek-chat / glm-4')
      .addText(text => text
        .setPlaceholder('gpt-4o')
        .setValue(this.plugin.settings.llmModel)
        .onChange(async (value) => {
          this.plugin.settings.llmModel = value;
          await this.plugin.saveSettings();
        }));
  }

  private displayClaudeSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Claude API 配置（AI 纪要）' });

    new Setting(containerEl)
      .setName('API Key')
      .setDesc('Anthropic API Key（API 独立计费，非 Claude Pro）')
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
      .setName('模型名称')
      .addText(text => text
        .setPlaceholder('claude-sonnet-4-5-20250929')
        .setValue(this.plugin.settings.claudeModel)
        .onChange(async (value) => {
          this.plugin.settings.claudeModel = value;
          await this.plugin.saveSettings();
        }));
  }
}
