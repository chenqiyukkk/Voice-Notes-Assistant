# Obsidian Lecture Recorder Plugin - 项目规划

> 课堂录音 + 笔记嵌入 + AI 总结纪要 一体化 Obsidian 插件

---

## 一、项目概述

**插件名称**：Lecture Recorder
**核心目标**：在 Obsidian 中实现课堂录音、将录音片段嵌入到笔记对应位置、并通过 AI 对录音内容进行转写和总结生成纪要。
**设计模式**：策略模式 (Strategy Pattern) — 转写和总结模块均抽象为统一接口 + 多 Provider 实现。

### 核心功能

| 功能模块 | 描述 |
|---------|------|
| 实时录音 | 在 Obsidian 内直接录音，支持暂停/继续，状态栏显示录音状态 |
| 录音嵌入 | 将录音片段以自定义代码块嵌入笔记的光标位置，支持内联播放 |
| 语音转写 | 支持 Whisper API / 科大讯飞 / 本地 whisper.cpp 三种后端 |
| AI 总结 | 支持 OpenAI 兼容 API (含 DeepSeek/硅基流动等) / Claude API |
| 时间戳标记 | 录音过程中可在笔记中插入时间戳锚点，点击跳转到对应录音位置 |

---

## 二、技术架构

### 2.1 技术选型

| 技术 | 选型 | 说明 |
|------|------|------|
| 语言 | TypeScript | Obsidian 插件标准语言 |
| 录音 | MediaRecorder API | 浏览器原生录音接口，Electron 环境支持良好 |
| 音频格式 | WebM (Opus) / WAV | WebM 体积小适合存储，WAV 兼容性好适合转写 |
| 语音转写 | Whisper API / 讯飞 / whisper.cpp | 用户可配置选择 |
| AI 总结 | OpenAI 兼容 / Claude API | 用户自选 API，支持多种 LLM 后端 |
| 构建工具 | esbuild | Obsidian 社区推荐的构建工具 |

### 2.2 项目目录结构

```
obsidian-lecture-recorder/
├── src/
│   ├── main.ts                        # 插件入口，注册命令/事件/视图
│   ├── settings.ts                    # 插件设置面板 (PluginSettingTab)
│   │
│   ├── recorder/
│   │   ├── AudioRecorder.ts           # 核心录音逻辑 (MediaRecorder 封装)
│   │   ├── RecorderControlView.ts     # 录音控制面板 UI (ItemView)
│   │   └── StatusBarManager.ts        # 状态栏录音状态显示
│   │
│   ├── transcription/
│   │   ├── TranscriptionService.ts    # 转写服务统一接口 + Provider 注册
│   │   ├── WhisperProvider.ts         # OpenAI Whisper API 实现
│   │   ├── XfyunProvider.ts           # 科大讯飞语音转写 (REST)
│   │   ├── LocalWhisperProvider.ts    # 本地 whisper.cpp (child_process)
│   │   └── TranscriptionCache.ts      # 转写结果缓存
│   │
│   ├── summary/
│   │   ├── SummaryService.ts          # 总结服务统一接口
│   │   ├── OpenAICompatProvider.ts    # OpenAI 兼容格式 (GPT/DeepSeek/硅基流动/智谱)
│   │   ├── ClaudeProvider.ts          # Anthropic Claude API
│   │   └── PromptTemplates.ts         # 总结提示词模板
│   │
│   ├── embed/
│   │   ├── AudioEmbedProcessor.ts     # 自定义代码块渲染 (音频播放器)
│   │   ├── TimestampManager.ts        # 时间戳标记与跳转管理
│   │   └── EmbedFormatter.ts          # 嵌入格式化工具
│   │
│   ├── storage/
│   │   ├── AudioFileManager.ts        # 音频文件存储管理
│   │   └── MetadataStore.ts           # 录音元数据 (时长、转写状态等)
│   │
│   └── utils/
│       ├── audioUtils.ts              # 音频处理 (WAV编码、格式转换、分片)
│       ├── timeUtils.ts               # 时间格式化工具
│       └── constants.ts               # 常量定义
│
├── styles.css                         # 插件样式
├── manifest.json                      # Obsidian 插件清单
├── package.json                       # Node.js 项目配置
├── tsconfig.json                      # TypeScript 配置
├── esbuild.config.mjs                 # 构建脚本
├── .gitignore
└── PROJECT_PLAN.md                    # 本文件
```

### 2.3 本地环境

- **whisper.cpp (CUDA)**: `D:/project/whisper.cpp/Release/whisper-cli.exe`
- **base 模型**: `D:/project/whisper.cpp/models/ggml-base.bin` (142MB)
- **GPU**: NVIDIA RTX 4060 Laptop 8GB，CUDA 12.7

---

## 三、当前进度与已知 Bug

### 已完成

- [x] **Phase 1**: 项目脚手架、录音功能、设置面板、状态栏、侧边栏面板
- [x] **Phase 2**: AudioEmbedProcessor 播放器渲染、TimestampManager 时间戳跳转、styles.css、Bug 修复完成
- [x] **Phase 3**: 三种转写后端、转写缓存、音频转码与分片、播放器转写按钮接入完成

### 已修复 Bug

- [x] **Bug 1: 录音结束后嵌入块不插入光标位置** — `stop()` 返回 `{ filePath, duration }`，开始录音时保存编辑器引用防止 activeEditor 为 null
- [x] **Bug 2: 播放器只在阅读视图渲染** — 添加 `LivePreviewExtension.ts`，CM6 ViewPlugin + Decoration.replace 实现 Live Preview 渲染
- [x] **Bug 3: 含录音笔记切换后显示失败** — `RangeError: Block decorations may not be specified via plugins`。根因：CM6 不允许 ViewPlugin 提供 `block: true` 的 Decoration.replace，必须用 StateField。修复内容：
  - `LivePreviewExtension.ts`：从 `ViewPlugin.fromClass` 重写为 `StateField.define` + `EditorView.decorations.from(field)`
  - `AudioEmbedProcessor.ts`：修复 MarkdownRenderChild 生命周期管理，延迟 `audio.src` 设置（`audio.preload = 'none'` + `setTimeout`），防止大文件 IO 阻塞笔记打开
  - `main.ts`：新增 `replaceRecordingBlockViaVault()` 兜底方案，当编辑器不可用时通过 `vault.process()` 直接修改文件内容

---

## 四、核心接口设计

### 4.1 转写 Provider 接口 (ITranscriptionProvider)

```typescript
interface TranscriptionSegment {
  start: number;   // 开始时间（秒）
  end: number;     // 结束时间（秒）
  text: string;    // 转写文本
}

interface TranscriptionResult {
  segments: TranscriptionSegment[];
  fullText: string;
  language: string;
  duration: number;
}

interface ITranscriptionProvider {
  readonly name: string;
  readonly id: string;
  validateConfig(): Promise<{ valid: boolean; message: string }>;
  transcribe(audioBuffer: ArrayBuffer, options: TranscriptionOptions,
    onProgress?: (progress: TranscriptionProgress) => void): Promise<TranscriptionResult>;
  getSupportedFormats(): string[];
  getMaxFileSize(): number;
}
```

### 4.2 总结 Provider 接口 (ISummaryProvider)

```typescript
interface ISummaryProvider {
  readonly name: string;
  readonly id: string;
  validateConfig(): Promise<{ valid: boolean; message: string }>;
  summarize(transcription: TranscriptionResult, options: SummaryOptions,
    onProgress?: (message: string) => void): Promise<string>;
}
```

---

## 五、三种转写后端详细设计

### 5.1 OpenAI Whisper API (`WhisperProvider`)

- **定价**：$0.006/分钟（45分钟课 ≈ $0.27 ≈ 2元）
- **限制**：单次上传 ≤ 25MB，长录音需分片
- **格式**：使用 `verbose_json` 获取带时间戳的 segments
- **API**：`POST {baseUrl}/audio/transcriptions`，FormData 上传
- **认证**：`Authorization: Bearer <key>`
- **baseUrl 可配置**：支持国内代理或 Groq Whisper 等兼容接口
- **注意**：Obsidian 的 `requestUrl` 不支持 FormData，必须用原生 `fetch`

### 5.2 科大讯飞语音转写 (`XfyunProvider`)

- **方式**：REST 录音文件转写（非 WebSocket 实时转写）
- **理由**：与"录完再转"工作流匹配，实现更简单
- **流程**：`预处理(prepare)` → `分片上传(upload)` → `合并(merge)` → `轮询进度(getProgress)` → `获取结果(getResult)`
- **签名**：`signa = Base64(HmacSHA1(secretKey, MD5(appId + ts)))`
- **格式限制**：不支持 WebM，需先用 `AudioContext` 转码为 16kHz WAV
- **免费额度**：新用户送 50 小时
- **坑点**：
  - `ts` 是秒级时间戳，不是毫秒
  - 签名有时效限制（约5分钟），每次请求需重新生成
  - esbuild 需配置 `external: ['crypto']`

### 5.3 本地 whisper.cpp (`LocalWhisperProvider`)

- **方式**：Node.js `child_process.exec()` 调用预编译二进制
- **可执行文件**：`whisper-cli.exe`（注意：`main.exe` 已弃用）
- **不用 WASM 的理由**：性能差、只支持小模型、内存限制大
- **格式**：whisper.cpp 只接受 16kHz WAV，需在插件端转码
- **输出**：使用 `--output-json` 参数获取带时间戳的 JSON
- **坑点**：
  - 二进制不能打包到插件（太大且跨平台），用户需自行下载
  - Windows 路径需引号包裹
  - 执行时间取决于 CPU 和模型大小，需设合理 timeout（600s）
  - HuggingFace 在国内下载极慢，需用代理或浏览器手动下载模型

---

## 六、两种总结后端详细设计

### 6.1 OpenAI 兼容格式 (`OpenAICompatProvider`)

兼容所有使用 OpenAI Chat Completions 格式的 API：
- OpenAI (GPT-4o, o1) / DeepSeek / 硅基流动 (SiliconFlow) / 智谱 (GLM-4) / Moonshot (Kimi)

**API**：`POST {baseUrl}/chat/completions`
**认证**：`Authorization: Bearer <key>`

### 6.2 Claude API (`ClaudeProvider`)

**与 OpenAI 的关键差异**：
| 差异点 | OpenAI | Claude |
|--------|--------|--------|
| Auth Header | `Authorization: Bearer <key>` | `x-api-key: <key>` |
| System Message | 放在 messages 数组里 | 顶层 `system` 字段 |
| 响应格式 | `choices[0].message.content` | `content[0].text` |
| 版本声明 | 不需要 | 需要 `anthropic-version` header |

---

## 七、嵌入与播放设计

### 7.1 自定义代码块

````markdown
```lecture-audio
file: recordings/recording-2026-02-24-0930.webm
title: 计算机组成原理 - 第5讲
duration: 00:45:12
```
````

使用 `registerMarkdownCodeBlockProcessor('lecture-audio', ...)` 渲染为内联播放器（**仅阅读视图生效，Live Preview 需 CM6 扩展**）。

### 7.2 播放器功能
- 🎙 标题 + 时长徽章
- ▶/⏸ 播放/暂停按钮（圆形，accent 主题色）
- 进度条（可点击跳转、拖拽、hover 显示手柄）
- 时间显示 `00:00 / 01:23`
- 倍速选择 (0.5x ~ 2.0x)
- 📝 转写录音 / ✨ 生成纪要 操作按钮

### 7.3 时间戳锚点

使用 Obsidian Callout 语法：
```markdown
> [!timestamp] 00:15:30
> 老师开始讲解 CPU 流水线
```

通过 `registerMarkdownPostProcessor` 监听 timestamp callout 的点击，跳转到对应录音位置播放。

### 7.4 内联录音块设计方案

**交互流程**：开始录音时在光标处立即创建录音控制块 → 块内操作录音（暂停/继续/停止）→ 停止后块自动更新为播放器。

#### 代码块格式

录音中：
````markdown
```lecture-audio
status: recording
title: 计算机组成原理 - 第5讲
```
````

录音完成后（与现有格式兼容）：
````markdown
```lecture-audio
file: recordings/recording-2026-02-25.webm
title: 计算机组成原理 - 第5讲
duration: 01:23:45
```
````

**判断逻辑**：有 `status` 字段 → 录音中的块；有 `file` 字段 → 已完成的播放块。两者互斥。

#### 录音块 UI（RecordingWidget）

```
┌────────────────────────────────────────┐
│ 🔴 计算机组成原理 - 第5讲              │ (header: 脉冲红点 + 标题)
│                                        │
│           00:15:23                      │ (实时计时器，每 200ms 更新)
│            录音中                       │ (状态文字)
│                                        │
│      [ ⏸ 暂停 ]    [ ⏹ 停止 ]         │ (控制按钮)
└────────────────────────────────────────┘
```

#### 涉及文件修改

| 文件 | 修改内容 |
|------|---------|
| `src/main.ts` | toggle-recording 改为先插占位块再开始录音；新增 `insertRecordingPlaceholder()` / `findAndUpdateRecordingBlock()` / `findAndRemoveRecordingBlock()` |
| `src/embed/LivePreviewExtension.ts` | 新增 `RecordingWidget` 类（计时器 + 暂停/停止按钮 + `view.dispatch()` 更新块）；`buildDecorations()` 分支：`status: recording` → RecordingWidget，`file` → AudioPlayerWidget |
| `src/embed/AudioEmbedProcessor.ts` | 解析 `status` 字段；Reading view 下显示"录音进行中，请切换到编辑模式"占位符 |
| `src/recorder/RecorderControlView.ts` | 侧边栏开始录音时也调用 `plugin.insertRecordingPlaceholder()`；停止时调用 `plugin.findAndUpdateRecordingBlock()` |
| `styles.css` | 录音块容器（红色边框 + 左侧红条）、脉冲红点动画、计时器、控制按钮样式 |

#### RecordingWidget 关键设计

- **`eq()`**：`status` + `title` 相同返回 `true`，防止 CM6 重建 DOM 导致 timer 中断
- **`ignoreEvent()`**：返回 `true`，拦截所有事件不传给编辑器
- **`destroy()`**：清理 `setInterval` 计时器
- **停止按钮 handler**：`await plugin.recorder.stop()` → 正则搜索文档中的 recording 块 → `view.dispatch()` 替换为完成态
- **录音块始终替换渲染**（不检查光标是否在块内），用户不应手动编辑录音中的块

#### 边界情况处理

| 场景 | 方案 |
|------|------|
| 录音中切换笔记 | `recordingFile` 保存文件引用，停止时通过 fallback 找回编辑器 |
| 录音保存失败 | `findAndRemoveRecordingBlock()` 清理占位块 |
| 用户手动删除了占位块 | 正则匹配失败，fallback 到 `insertEmbedBlockAtCursor()` |
| 无编辑器（没打开笔记） | Notice 提示用户先打开笔记 |
| Reading view | 只显示占位文字，无法交互 |

---

## 八、开发计划（分阶段）

### Phase 1：基础框架 + 录音功能 ✅ 已完成
- [x] 初始化项目脚手架
- [x] 实现 `main.ts` 插件入口
- [x] 实现 `AudioRecorder.ts` 核心录音逻辑
- [x] 实现 `RecorderControlView.ts` 侧边栏面板
- [x] 实现 `StatusBarManager.ts` 状态栏
- [x] 实现 `AudioFileManager.ts` 文件管理
- [x] 基础 `settings.ts` 全部设置项

### Phase 2：笔记嵌入 + 播放 ✅ 已完成
- [x] 实现 `AudioEmbedProcessor.ts` 代码块渲染为播放器
- [x] 播放器 UI（播放/暂停/进度条/倍速/时间显示/操作按钮）
- [x] 实现 `TimestampManager.ts` 时间戳点击跳转
- [x] `styles.css` 播放器完整样式
- [x] Bug 修复：`stop()` 返回 `{ filePath, duration }`、保存编辑器引用
- [x] Bug 修复：`LivePreviewExtension.ts` CM6 StateField + Decoration.replace 实现 Live Preview 渲染（初版 ViewPlugin 实现因 block decoration 限制已重写）
- [x] **内联录音块**：开始录音时在光标处创建录音控制块，块内直接操作
  - [x] 改造 `main.ts` toggle-recording 命令流程
  - [x] 新增 `insertRecordingPlaceholder()` / `findAndUpdateRecordingBlock()` / `findAndRemoveRecordingBlock()`
  - [x] `LivePreviewExtension.ts` 新增 `RecordingWidget`（计时器 + 暂停/停止按钮）
  - [x] `AudioEmbedProcessor.ts` Reading view 录音占位符
  - [x] `RecorderControlView.ts` 同步侧边栏入口
  - [x] `styles.css` 录音块样式（脉冲红点、计时器、控制按钮）

### Phase 3：语音转写（3 种后端） ✅ 已完成
- [x] 实现 `src/transcription/TranscriptionService.ts` 统一入口 + Provider 注册
- [x] 实现 `src/transcription/WhisperProvider.ts` (OpenAI Whisper API)
  - FormData 上传，`verbose_json` 格式
  - 长录音自动分片（每片 < 25MB）
- [x] 实现 `src/transcription/XfyunProvider.ts` (科大讯飞 REST 转写)
  - 签名算法：`Base64(HmacSHA1(secretKey, MD5(appId + ts)))`
  - 五步流程：prepare → upload → merge → getProgress → getResult
  - WebM → WAV 转码
- [x] 实现 `src/transcription/LocalWhisperProvider.ts` (whisper.cpp)
  - `child_process.exec()` 调用 `whisper-cli.exe`
  - WebM → 16kHz WAV 转码
  - `--output-json` 获取带时间戳结果
- [x] 实现 `src/transcription/TranscriptionCache.ts` 转写结果缓存
- [x] 实现 `src/utils/audioUtils.ts` 音频格式转换
  - `encodeWav()` - Float32Array PCM → WAV
  - `convertToWav16k()` - 任意格式 → 16kHz 单声道 WAV（使用 OfflineAudioContext）
  - `splitAudioBuffer()` - 按大小分片
- [x] 转写进度 Notice 显示
- [x] 播放器中"转写录音"按钮接入实际逻辑
- [x] 转写结果保存为 `.transcript.json` 文件

### Phase 4：AI 总结
- [x] 实现 `src/summary/SummaryService.ts` 统一入口
- [x] 实现 `src/summary/OpenAICompatProvider.ts`
  - `POST {baseUrl}/chat/completions`
  - `Authorization: Bearer <key>`
  - temperature: 0.3（低温度保证结构化输出稳定）
- [x] 实现 `src/summary/ClaudeProvider.ts`
  - `POST https://api.anthropic.com/v1/messages`
  - `x-api-key` + `anthropic-version` header
  - system 在顶层字段
- [x] 实现 `src/summary/PromptTemplates.ts` 课堂纪要提示词模板
  - 默认模板：核心要点 + 详细内容(带时间戳) + 关键术语表 + 复习建议
  - 支持 `{{courseName}}` `{{date}}` `{{duration}}` 占位符
- [x] 纪要生成后插入笔记（音频嵌入块下方）
- [x] 播放器中"生成纪要"按钮接入实际逻辑
- [x] 自动转写 + 自动总结流水线（`autoTranscribe` / `autoSummarize` 设置联动）

### Phase 5：优化与完善
- [x] 音频波形可视化
- [x] 录音列表管理视图
- [x] 批量转写与总结
- [x] 长文本分段总结（hierarchical summarization，应对超长课程）
- [ ] 移动端兼容性测试（已补充响应式样式，待真机验证）
- [x] 性能优化（大文件处理：波形大小阈值 + 分段总结 + 批处理静默任务）
- [x] 国际化 (i18n) 骨架（中英字典 + 录音管理界面接入）

---

## 九、风险点与注意事项

### 高优先级

| 风险 | 缓解措施 |
|------|----------|
| 长录音内存溢出 | `MediaRecorder.start(10000)` 每10秒采集一次 + 考虑 IndexedDB 暂存 |
| WebM 格式转码 | 讯飞/whisper.cpp 不支持 WebM，统一用 `AudioContext.decodeAudioData()` + WAV 编码 |
| sampleRate 不兼容 | 录音时不强制采样率，转写前统一重采样为 16kHz |
| Electron Node.js API | esbuild external 配置排除 `crypto`/`child_process` 等模块 |
| API Key 安全 | 密码字段显示 + 提醒用户不要同步 data.json |

### 中优先级

| 风险 | 缓解措施 |
|------|----------|
| 讯飞签名时效 | 每次请求重新生成签名 |
| 音频分片断句 | 后续用静音检测或 WebM Cluster 边界切分 |
| LLM token 限制 | 长转写分段总结再合并 (hierarchical summarization) |

### 低优先级

| 风险 | 缓解措施 |
|------|----------|
| 移动端不可用 | 先 `isDesktopOnly: true`，Phase 5 探索移动端方案 |
| whisper.cpp 跨平台 | 提供各平台预编译二进制下载链接 |
| HuggingFace 国内下载慢 | 需要代理或浏览器手动下载模型文件 |

---

## 十、API 费用参考

### 语音转写

| 服务 | 定价 | 45分钟课程费用 | 备注 |
|------|------|---------------|------|
| OpenAI Whisper | $0.006/分钟 | ~2元 | 新用户 $5 免费 |
| 科大讯飞 | 4.9-9.9 元/小时 | ~4-7元 | 新用户送 50 小时 |
| 阿里云 | 1-2.5 元/小时 | ~1-2元 | 量大优惠 |
| 本地 whisper.cpp | 免费 | 0 | 需要 CPU/GPU 算力 |

### AI 总结

| 服务 | 定价 | 备注 |
|------|------|------|
| GPT-4o | $5/1M input tokens | 最通用 |
| DeepSeek | 0.5 元/1M tokens | 国内最便宜之一 |
| 硅基流动 | 按模型定价 | 支持多种开源模型 |
| Claude API | 按模型定价 | 需单独充值，Pro 订阅不可用 |

> **重要**：ChatGPT Plus、Claude Pro 等消费者订阅与 API 是完全独立的计费系统，不能互通。
