export type UiLanguage = 'zh' | 'en';

type I18nKey =
  | 'panel.title'
  | 'state.ready'
  | 'state.recording'
  | 'state.paused'
  | 'state.processing'
  | 'btn.startRecording'
  | 'btn.stopRecording'
  | 'btn.pause'
  | 'btn.resume'
  | 'manager.title'
  | 'manager.refresh'
  | 'manager.selectAll'
  | 'manager.clear'
  | 'manager.batchTranscribe'
  | 'manager.batchSummarize'
  | 'manager.batchBoth'
  | 'manager.empty'
  | 'manager.noneSelected'
  | 'manager.processing'
  | 'manager.done'
  | 'item.transcript'
  | 'item.summary'
  | 'item.noTranscript'
  | 'item.noSummary'
  | 'item.transcribe'
  | 'item.summarize'
  | 'manager.totalCount'
  | 'manager.singleTranscribing'
  | 'manager.singleSummarizing'
  | 'manager.batchFailed'
  | 'player.error.missingPath'
  | 'player.error.fileNotFound'
  | 'player.error.loadFailed'
  | 'player.reading.title'
  | 'player.reading.tip'
  | 'player.title.fallback'
  | 'player.play.aria'
  | 'player.action.transcribe'
  | 'player.action.summarize'
  | 'player.transcript.emptyTitle'
  | 'player.transcript.emptyContent'
  | 'player.transcript.readyTitle'
  | 'player.summary.emptyTitle'
  | 'player.summary.emptyContent'
  | 'player.summary.readyTitle'
  | 'recording.title.fallback'
  | 'recording.state.recording'
  | 'recording.state.paused'
  | 'recording.state.processing'
  | 'recording.action.pause'
  | 'recording.action.resume'
  | 'recording.action.stop'
  | 'recording.action.pause.aria'
  | 'recording.action.stop.aria';

const MESSAGES: Record<UiLanguage, Record<I18nKey, string>> = {
  zh: {
    'panel.title': '语音纪要助手',
    'state.ready': '就绪',
    'state.recording': '录音中',
    'state.paused': '已暂停',
    'state.processing': '处理中',
    'btn.startRecording': '开始录音',
    'btn.stopRecording': '停止录音',
    'btn.pause': '暂停',
    'btn.resume': '继续',
    'manager.title': '录音列表管理',
    'manager.refresh': '刷新',
    'manager.selectAll': '全选',
    'manager.clear': '清空',
    'manager.batchTranscribe': '批量转写',
    'manager.batchSummarize': '批量总结',
    'manager.batchBoth': '批量转写+总结',
    'manager.empty': '暂无录音文件',
    'manager.noneSelected': '请先选择至少一个录音',
    'manager.processing': '处理中 {{current}}/{{total}}: {{file}} - {{message}}',
    'manager.done': '批量处理完成：成功 {{ok}} / {{total}}',
    'item.transcript': '已转写',
    'item.summary': '已纪要',
    'item.noTranscript': '未转写',
    'item.noSummary': '未纪要',
    'item.transcribe': '转写',
    'item.summarize': '纪要',
    'manager.totalCount': '共 {{count}} 条录音',
    'manager.singleTranscribing': '转写中: {{file}}',
    'manager.singleSummarizing': '纪要中: {{file}}',
    'manager.batchFailed': '批量处理中有失败: {{file}} - {{reason}}',
    'player.error.missingPath': '缺少音频文件路径',
    'player.error.fileNotFound': '音频文件未找到: {{file}}',
    'player.error.loadFailed': '播放器加载失败',
    'player.reading.title': '🎙 {{title}}',
    'player.reading.tip': '录音进行中，请切换到编辑模式操作',
    'player.title.fallback': '未命名录音',
    'player.play.aria': '播放',
    'player.action.transcribe': '📝 转写录音',
    'player.action.summarize': '✨ 生成纪要',
    'player.transcript.emptyTitle': '🧾 转写结果（未生成）',
    'player.transcript.emptyContent': '暂无转写结果，点击“转写录音”后可在此展开查看。',
    'player.transcript.readyTitle': '🧾 转写结果（{{count}} 段，点击展开）',
    'player.summary.emptyTitle': '✨ 纪要结果（未生成）',
    'player.summary.emptyContent': '暂无纪要结果，点击“生成纪要”后可在此展开查看。',
    'player.summary.readyTitle': '✨ 纪要结果（{{chars}} 字，点击展开）',
    'recording.title.fallback': '未命名课程',
    'recording.state.recording': '录音中',
    'recording.state.paused': '已暂停',
    'recording.state.processing': '处理中',
    'recording.action.pause': '暂停',
    'recording.action.resume': '继续',
    'recording.action.stop': '停止',
    'recording.action.pause.aria': '暂停或继续录音',
    'recording.action.stop.aria': '停止录音',
  },
  en: {
    'panel.title': 'Voice Notes Assistant',
    'state.ready': 'Ready',
    'state.recording': 'Recording',
    'state.paused': 'Paused',
    'state.processing': 'Processing',
    'btn.startRecording': 'Start Recording',
    'btn.stopRecording': 'Stop Recording',
    'btn.pause': 'Pause',
    'btn.resume': 'Resume',
    'manager.title': 'Recording Manager',
    'manager.refresh': 'Refresh',
    'manager.selectAll': 'Select All',
    'manager.clear': 'Clear',
    'manager.batchTranscribe': 'Batch Transcribe',
    'manager.batchSummarize': 'Batch Summarize',
    'manager.batchBoth': 'Batch Both',
    'manager.empty': 'No recordings found',
    'manager.noneSelected': 'Please select at least one recording',
    'manager.processing': 'Processing {{current}}/{{total}}: {{file}} - {{message}}',
    'manager.done': 'Batch done: success {{ok}} / {{total}}',
    'item.transcript': 'Transcribed',
    'item.summary': 'Summarized',
    'item.noTranscript': 'No transcript',
    'item.noSummary': 'No summary',
    'item.transcribe': 'Transcribe',
    'item.summarize': 'Summarize',
    'manager.totalCount': '{{count}} recordings',
    'manager.singleTranscribing': 'Transcribing: {{file}}',
    'manager.singleSummarizing': 'Summarizing: {{file}}',
    'manager.batchFailed': 'Batch failed: {{file}} - {{reason}}',
    'player.error.missingPath': 'Missing audio file path',
    'player.error.fileNotFound': 'Audio file not found: {{file}}',
    'player.error.loadFailed': 'Failed to load player',
    'player.reading.title': '🎙 {{title}}',
    'player.reading.tip': 'Recording in progress. Switch to edit mode to control it.',
    'player.title.fallback': 'Untitled recording',
    'player.play.aria': 'Play',
    'player.action.transcribe': '📝 Transcribe',
    'player.action.summarize': '✨ Summarize',
    'player.transcript.emptyTitle': '🧾 Transcript (not generated)',
    'player.transcript.emptyContent': 'No transcript yet. Click "Transcribe" to generate and view it here.',
    'player.transcript.readyTitle': '🧾 Transcript ({{count}} segments, click to expand)',
    'player.summary.emptyTitle': '✨ Summary (not generated)',
    'player.summary.emptyContent': 'No summary yet. Click "Summarize" to generate and view it here.',
    'player.summary.readyTitle': '✨ Summary ({{chars}} chars, click to expand)',
    'recording.title.fallback': 'Untitled course',
    'recording.state.recording': 'Recording',
    'recording.state.paused': 'Paused',
    'recording.state.processing': 'Processing',
    'recording.action.pause': 'Pause',
    'recording.action.resume': 'Resume',
    'recording.action.stop': 'Stop',
    'recording.action.pause.aria': 'Pause or resume recording',
    'recording.action.stop.aria': 'Stop recording',
  },
};

export function i18n(
  language: UiLanguage | undefined,
  key: I18nKey,
  vars?: Record<string, string | number>,
): string {
  const locale = language === 'en' ? 'en' : 'zh';
  const template = MESSAGES[locale][key] || MESSAGES.zh[key] || key;
  if (!vars) {
    return template;
  }

  return template.replace(/\{\{(\w+)\}\}/g, (_, token: string) => {
    const value = vars[token];
    if (value === undefined || value === null) {
      return '';
    }
    return String(value);
  });
}
