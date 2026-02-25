export const PLUGIN_ID = 'lecture-recorder';
export const VIEW_TYPE_RECORDER = 'lecture-recorder-control';
export const AUDIO_EMBED_TYPE = 'lecture-audio';

export const AUDIO_BITRATES: Record<string, number> = {
  low: 64000,
  standard: 128000,
  high: 256000,
};

export const SUPPORTED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/wav',
];
