import { MarkdownPostProcessorContext, Notice } from 'obsidian';
import type LectureRecorderPlugin from '../main';
import { AudioEmbedProcessor } from './AudioEmbedProcessor';

export class TimestampManager {
  private plugin: LectureRecorderPlugin;

  constructor(plugin: LectureRecorderPlugin) {
    this.plugin = plugin;
  }

  /**
   * 注册 Markdown 后处理器，为 timestamp callout 添加点击跳转
   */
  register(): void {
    this.plugin.registerMarkdownPostProcessor(
      (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
        this.processTimestamps(el);
      },
    );
  }

  /**
   * 扫描 DOM 中的 timestamp callout 并添加点击事件
   */
  private processTimestamps(el: HTMLElement): void {
    const callouts = el.querySelectorAll('.callout[data-callout="timestamp"]');

    callouts.forEach((callout) => {
      const titleInner = callout.querySelector('.callout-title-inner');
      if (!titleInner) return;

      const timeStr = titleInner.textContent?.trim();
      if (!timeStr) return;

      // 添加可点击样式
      titleInner.addClass('timestamp-clickable');

      // 点击跳转
      titleInner.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.jumpToTimestamp(timeStr);
      });
    });
  }

  /**
   * 跳转到音频的指定时间点
   */
  private jumpToTimestamp(timeStr: string): void {
    const audio = AudioEmbedProcessor.getActiveAudio();

    if (!audio) {
      new Notice('没有找到活跃的音频播放器，请先在笔记中加载一个录音');
      return;
    }

    const seconds = this.parseTimeString(timeStr);
    if (seconds < 0) {
      new Notice(`无法解析时间戳: ${timeStr}`);
      return;
    }

    audio.currentTime = seconds;
    audio.play();
    new Notice(`跳转到 ${timeStr}`);
  }

  /**
   * 解析时间字符串为秒数
   * 支持 "01:23:45", "23:45", "45" 等格式
   */
  private parseTimeString(timeStr: string): number {
    const parts = timeStr.split(':').map(s => parseFloat(s.trim()));

    if (parts.some(isNaN)) return -1;

    switch (parts.length) {
      case 3: // HH:MM:SS
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
      case 2: // MM:SS
        return parts[0] * 60 + parts[1];
      case 1: // SS
        return parts[0];
      default:
        return -1;
    }
  }
}
