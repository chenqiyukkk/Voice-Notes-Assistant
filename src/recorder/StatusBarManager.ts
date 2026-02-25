import type LectureRecorderPlugin from '../main';
import { RecorderState } from './AudioRecorder';
import { formatDuration } from '../utils/timeUtils';

export class StatusBarManager {
  private plugin: LectureRecorderPlugin;
  private statusBarEl: HTMLElement;
  private timerInterval: number | null = null;

  constructor(plugin: LectureRecorderPlugin) {
    this.plugin = plugin;
    this.statusBarEl = plugin.addStatusBarItem();
    this.statusBarEl.addClass('lecture-recorder-status');
    this.update(RecorderState.IDLE);
  }

  update(state: RecorderState): void {
    switch (state) {
      case RecorderState.RECORDING:
        this.startTimer();
        break;
      case RecorderState.PAUSED:
        this.stopTimer();
        this.statusBarEl.setText('⏸ 已暂停');
        break;
      case RecorderState.IDLE:
        this.stopTimer();
        this.statusBarEl.setText('');
        break;
    }
  }

  private startTimer(): void {
    this.stopTimer();
    this.timerInterval = window.setInterval(() => {
      const elapsed = this.plugin.recorder.getElapsedTime();
      this.statusBarEl.setText(`🔴 录音中 ${formatDuration(elapsed)}`);
    }, 1000);
    // 立即更新一次
    const elapsed = this.plugin.recorder.getElapsedTime();
    this.statusBarEl.setText(`🔴 录音中 ${formatDuration(elapsed)}`);
  }

  private stopTimer(): void {
    if (this.timerInterval !== null) {
      window.clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  destroy(): void {
    this.stopTimer();
  }
}
