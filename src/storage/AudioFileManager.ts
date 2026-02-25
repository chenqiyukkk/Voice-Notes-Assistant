import { TFile } from 'obsidian';
import type LectureRecorderPlugin from '../main';

export interface AudioFileMetadata {
  filePath: string;
  title: string;
  duration: number; // 毫秒
  createdAt: string;
  transcribed: boolean;
  summarized: boolean;
}

export class AudioFileManager {
  private plugin: LectureRecorderPlugin;

  constructor(plugin: LectureRecorderPlugin) {
    this.plugin = plugin;
  }

  /**
   * 获取录音文件的 Vault 资源路径（用于 Audio 元素播放）
   */
  getResourcePath(filePath: string): string | null {
    const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
    if (file instanceof TFile) {
      return this.plugin.app.vault.getResourcePath(file);
    }
    return null;
  }

  /**
   * 读取录音文件的二进制内容
   */
  async readBinary(filePath: string): Promise<ArrayBuffer> {
    const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) {
      throw new Error(`文件不存在: ${filePath}`);
    }
    return await this.plugin.app.vault.readBinary(file);
  }

  /**
   * 列出所有录音文件
   */
  listRecordings(): TFile[] {
    const storagePath = this.plugin.settings.recordingStoragePath;
    const files = this.plugin.app.vault.getFiles();
    return files.filter(f =>
      f.path.startsWith(storagePath + '/') &&
      (
        f.extension === 'webm' ||
        f.extension === 'wav' ||
        f.extension === 'ogg' ||
        f.extension === 'mp3' ||
        f.extension === 'm4a'
      )
    );
  }

  /**
   * 确保存储目录存在
   */
  async ensureStorageDir(): Promise<void> {
    const storagePath = this.plugin.settings.recordingStoragePath;
    const adapter = this.plugin.app.vault.adapter;
    const exists = await adapter.exists(storagePath);
    if (!exists) {
      await adapter.mkdir(storagePath);
    }
  }
}
