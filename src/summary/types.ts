import type { TranscriptionResult } from '../transcription/types';

export interface SummaryContext {
  courseName: string;
  date: string;
  duration: string;
}

export interface SummaryOptions {
  context: SummaryContext;
  template?: string;
}

export interface ProviderValidationResult {
  valid: boolean;
  message: string;
}

export interface SummaryRunMetadata {
  providerId: string;
  model: string;
  createdAt: string;
}

export interface SummaryRunResult {
  summary: string;
  metadata: SummaryRunMetadata;
}

export interface ISummaryProvider {
  readonly name: string;
  readonly id: string;
  validateConfig(): Promise<ProviderValidationResult>;
  summarize(
    transcription: TranscriptionResult,
    options: SummaryOptions,
    onProgress?: (message: string) => void,
  ): Promise<SummaryRunResult>;
}
