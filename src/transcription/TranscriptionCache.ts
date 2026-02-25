import { TFile } from 'obsidian';
import type LectureRecorderPlugin from '../main';
import { TranscriptionResult } from './types';

interface CachedTranscriptionPayload {
  version: number;
  audioFilePath: string;
  createdAt: string;
  result: TranscriptionResult;
}

export class TranscriptionCache {
  private plugin: LectureRecorderPlugin;

  constructor(plugin: LectureRecorderPlugin) {
    this.plugin = plugin;
  }

  getTranscriptPath(audioFilePath: string): string {
    return `${audioFilePath}.transcript.json`;
  }

  async load(audioFilePath: string): Promise<TranscriptionResult | null> {
    const transcriptPath = this.getTranscriptPath(audioFilePath);
    const file = this.plugin.app.vault.getAbstractFileByPath(transcriptPath);
    if (!(file instanceof TFile)) {
      return null;
    }

    try {
      const content = await this.plugin.app.vault.read(file);
      const payload = JSON.parse(content) as CachedTranscriptionPayload;
      if (!payload?.result) {
        return null;
      }
      return payload.result;
    } catch (err) {
      console.error('Lecture Recorder: 读取转写缓存失败', err);
      return null;
    }
  }

  async save(audioFilePath: string, result: TranscriptionResult): Promise<string> {
    const transcriptPath = this.getTranscriptPath(audioFilePath);
    const payload: CachedTranscriptionPayload = {
      version: 1,
      audioFilePath,
      createdAt: new Date().toISOString(),
      result,
    };
    const text = JSON.stringify(payload, null, 2);

    const existed = this.plugin.app.vault.getAbstractFileByPath(transcriptPath);
    if (existed instanceof TFile) {
      await this.plugin.app.vault.modify(existed, text);
    } else {
      await this.plugin.app.vault.create(transcriptPath, text);
    }

    return transcriptPath;
  }
}
