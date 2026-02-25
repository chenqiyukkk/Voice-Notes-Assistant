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
  | 'item.summarize';

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
  },
};

export function i18n(
  language: UiLanguage | string | undefined,
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
