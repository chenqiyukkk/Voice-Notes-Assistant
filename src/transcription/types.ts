export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  segments: TranscriptionSegment[];
  fullText: string;
  language: string;
  duration: number;
  providerId: string;
  createdAt: string;
}

export interface TranscriptionProgress {
  stage: 'prepare' | 'convert' | 'upload' | 'processing' | 'download' | 'done';
  message: string;
  progress?: number;
}

export interface TranscriptionOptions {
  language?: string;
  fileName?: string;
  mimeType?: string;
}

export interface ProviderValidationResult {
  valid: boolean;
  message: string;
}

export interface ITranscriptionProvider {
  readonly name: string;
  readonly id: string;
  validateConfig(): Promise<ProviderValidationResult>;
  transcribe(
    audioBuffer: ArrayBuffer,
    options: TranscriptionOptions,
    onProgress?: (progress: TranscriptionProgress) => void,
  ): Promise<TranscriptionResult>;
  getSupportedFormats(): string[];
  getMaxFileSize(): number;
}
