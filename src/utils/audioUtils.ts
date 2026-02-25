/**
 * Float32 PCM 编码为 16-bit PCM WAV
 */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const bytesPerSample = 2;
  const numChannels = 1;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    const value = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    view.setInt16(offset, Math.round(value), true);
    offset += 2;
  }

  return buffer;
}

/**
 * 任意音频格式 -> 16kHz 单声道 WAV
 */
export async function convertToWav16k(audioBuffer: ArrayBuffer): Promise<ArrayBuffer> {
  if (typeof AudioContext === 'undefined' || typeof OfflineAudioContext === 'undefined') {
    throw new Error('当前环境不支持 AudioContext，无法进行音频转码');
  }

  const decodeContext = new AudioContext();
  try {
    const decoded = await decodeContext.decodeAudioData(audioBuffer.slice(0));
    const monoSource = mixDownToMono(decoded, decodeContext);

    const targetSampleRate = 16000;
    const targetLength = Math.max(1, Math.ceil(decoded.duration * targetSampleRate));
    const offline = new OfflineAudioContext(1, targetLength, targetSampleRate);
    const source = offline.createBufferSource();
    source.buffer = monoSource;
    source.connect(offline.destination);
    source.start(0);

    const rendered = await offline.startRendering();
    const channelData = rendered.getChannelData(0);
    return encodeWav(new Float32Array(channelData), targetSampleRate);
  } finally {
    if (typeof decodeContext.close === 'function') {
      await decodeContext.close();
    }
  }
}

/**
 * 按体积切分 WAV（PCM16）缓冲区，返回多个可独立使用的 WAV 分片
 */
export function splitAudioBuffer(audioBuffer: ArrayBuffer, maxBytes: number): ArrayBuffer[] {
  if (maxBytes <= 44) {
    throw new Error('maxBytes 必须大于 44 字节');
  }

  if (audioBuffer.byteLength <= maxBytes) {
    return [audioBuffer];
  }

  const wavInfo = parseWavPcm16(audioBuffer);
  const bytesPerSample = wavInfo.bitsPerSample / 8;
  const frameBytes = bytesPerSample * wavInfo.numChannels;
  const maxDataBytes = Math.max(frameBytes, Math.floor((maxBytes - 44) / frameBytes) * frameBytes);

  const chunks: ArrayBuffer[] = [];
  let offset = 0;

  while (offset < wavInfo.pcmData.length) {
    const end = Math.min(offset + maxDataBytes, wavInfo.pcmData.length);
    const pcmSlice = wavInfo.pcmData.subarray(offset, end);
    const floatSlice = pcm16ToFloat32(pcmSlice);
    chunks.push(encodeWav(floatSlice, wavInfo.sampleRate));
    offset = end;
  }

  return chunks;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...Array.from(chunk));
  }

  return btoa(binary);
}

function writeString(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i++) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function mixDownToMono(decoded: AudioBuffer, context: BaseAudioContext): AudioBuffer {
  const mono = context.createBuffer(1, decoded.length, decoded.sampleRate);
  const out = mono.getChannelData(0);
  const channels = decoded.numberOfChannels;

  for (let i = 0; i < decoded.length; i++) {
    let sum = 0;
    for (let ch = 0; ch < channels; ch++) {
      sum += decoded.getChannelData(ch)[i];
    }
    out[i] = sum / channels;
  }

  return mono;
}

function pcm16ToFloat32(pcmData: Uint8Array): Float32Array {
  const sampleCount = Math.floor(pcmData.length / 2);
  const out = new Float32Array(sampleCount);
  const view = new DataView(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength);

  for (let i = 0; i < sampleCount; i++) {
    const sample = view.getInt16(i * 2, true);
    out[i] = sample / 0x8000;
  }

  return out;
}

interface ParsedWavPcm16 {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  pcmData: Uint8Array;
}

function parseWavPcm16(audioBuffer: ArrayBuffer): ParsedWavPcm16 {
  const view = new DataView(audioBuffer);

  if (readString(view, 0, 4) !== 'RIFF' || readString(view, 8, 4) !== 'WAVE') {
    throw new Error('splitAudioBuffer 仅支持 WAV 输入');
  }

  let offset = 12;
  let sampleRate = 0;
  let numChannels = 0;
  let bitsPerSample = 0;
  let pcmData: Uint8Array | null = null;

  while (offset + 8 <= view.byteLength) {
    const chunkId = readString(view, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataStart = offset + 8;
    const chunkDataEnd = chunkDataStart + chunkSize;

    if (chunkDataEnd > view.byteLength) {
      break;
    }

    if (chunkId === 'fmt ') {
      numChannels = view.getUint16(chunkDataStart + 2, true);
      sampleRate = view.getUint32(chunkDataStart + 4, true);
      bitsPerSample = view.getUint16(chunkDataStart + 14, true);
    } else if (chunkId === 'data') {
      pcmData = new Uint8Array(audioBuffer, chunkDataStart, chunkSize);
    }

    offset = chunkDataEnd + (chunkSize % 2);
  }

  if (!pcmData || !sampleRate || !numChannels || !bitsPerSample) {
    throw new Error('无法解析 WAV 文件');
  }

  if (bitsPerSample !== 16 || numChannels !== 1) {
    throw new Error('当前仅支持 16-bit 单声道 WAV 分片');
  }

  return {
    sampleRate,
    numChannels,
    bitsPerSample,
    pcmData,
  };
}

function readString(view: DataView, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += String.fromCharCode(view.getUint8(offset + i));
  }
  return out;
}
