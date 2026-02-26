# Voice Notes Assistant

一个用于 Obsidian 的录音、转写与 AI 纪要插件，面向课堂、会议、访谈等场景。

- Plugin ID: `lecture-recorder`
- Name: `Voice Notes Assistant`
- Min Obsidian version: `1.0.0`
- Desktop only: `true`

## 功能特性

- 录音内嵌块（inline block）：
  - 在笔记内插入 `lecture-audio` 代码块并实时显示录音状态
  - 支持暂停 / 继续 / 停止
- 音频播放器：
  - 播放 / 暂停、进度拖拽、倍速播放
  - 波形（waveform，音频波形）可视化
- 转写（transcription，语音转文字）：
  - OpenAI Whisper
  - 科大讯飞
  - 本地 whisper.cpp
- AI 纪要（summary，总结）：
  - OpenAI-compatible API（OpenAI / DeepSeek / 硅基流动等）
  - Claude API
  - 支持长文本分段汇总（hierarchical summarize）
- 结果展示与缓存：
  - 转写结果显示在录音块折叠栏
  - 纪要结果显示在录音块折叠栏（不打乱原笔记结构）
  - 自动保存 sidecar 文件缓存
- 录音管理：
  - 批量转写 / 批量纪要 / 批量转写+纪要
- 多语言界面：
  - 设置页与主要界面支持中文 / English 切换

## 使用流程

1. 在设置页完成转写服务与纪要服务配置（至少填 API Key）。
2. 通过命令或侧边栏开始录音。
3. 停止录音后会插入音频块。
4. 在音频块中点击“转写录音”或“生成纪要”。
5. 在折叠栏查看转写/纪要结果。

## 输出文件说明

录音与缓存文件均保存于你的 Vault 内：

- 录音文件：`recordings/xxx.wav` 或 `recordings/xxx.webm`
- 转写缓存：`<audio-file>.transcript.json`
- 纪要缓存：`<audio-file>.summary.md`

说明：
- 纪要默认不再回写到笔记正文，避免打乱笔记结构。
- 纪要内容会在音频块“纪要结果”折叠栏中展示，并写入 sidecar 缓存文件。

## 命令列表

- `开始/停止录音`
- `暂停/继续录音`
- `插入时间戳`
- `打开录音面板`
- `批量转写全部录音`
- `批量转写并总结全部录音`

## 安装（开发版 / 本地源码）

1. 将仓库放到你的 Vault 插件目录，例如：
   - `<YourVault>/.obsidian/plugins/lecture-recorder`
2. 安装依赖并构建：

```bash
npm install
npm run build
```

3. 打开 Obsidian：
   - 设置 -> 第三方插件（Community Plugins）
   - 启用该插件（如未出现可重载 Obsidian）

## 开发

```bash
npm install
npm run dev
npm run build
```

技术栈：
- TypeScript
- Obsidian API
- esbuild

## 项目结构（核心）

- `src/main.ts`：插件入口、命令注册、录音/转写/纪要任务编排
- `src/recorder/*`：录音控制与侧边栏
- `src/embed/*`：音频块渲染（Reading + Live Preview）
- `src/transcription/*`：多 Provider 转写实现
- `src/summary/*`：AI 纪要生成实现
- `src/settings.ts`：设置页与配置项
- `src/i18n.ts`：中英文文案
- `styles.css`：播放器与录音 UI 样式

## License

MIT

