interface WaveformOptions {
  hostEl: HTMLElement;
  audio: HTMLAudioElement;
  filePath: string;
  readBinary: (filePath: string) => Promise<ArrayBuffer>;
  maxFileSizeMB?: number;
}

type CleanupFn = () => void;

const PEAK_CACHE = new Map<string, number[]>();
const DEFAULT_MAX_FILE_SIZE_MB = 50;
const TARGET_BAR_COUNT = 140;
const WAVEFORM_HEIGHT = 56;

export function attachWaveform(options: WaveformOptions): CleanupFn {
  const containerEl = options.hostEl.createDiv({ cls: 'waveform-container is-loading' });
  const canvasEl = containerEl.createEl('canvas', { cls: 'waveform-canvas' });
  const statusEl = containerEl.createDiv({ cls: 'waveform-status', text: '波形加载中...' });

  const ctx = canvasEl.getContext('2d');
  if (!ctx) {
    containerEl.remove();
    return () => undefined;
  }

  let peaks: number[] | null = null;
  let destroyed = false;
  let rafId = 0;
  let renderWidth = 1;
  const maxSizeMB = options.maxFileSizeMB || DEFAULT_MAX_FILE_SIZE_MB;
  const maxSizeBytes = Math.max(1, maxSizeMB) * 1024 * 1024;

  const scheduleRender = () => {
    if (destroyed || rafId) {
      return;
    }
    rafId = window.requestAnimationFrame(() => {
      rafId = 0;
      renderWaveform();
    });
  };

  const updateStatus = (text: string) => {
    statusEl.textContent = text;
    statusEl.removeClass('is-hidden');
  };

  const hideStatus = () => {
    statusEl.addClass('is-hidden');
    containerEl.removeClass('is-loading');
  };

  const resizeCanvas = () => {
    const width = Math.max(1, Math.floor(containerEl.clientWidth));
    const height = WAVEFORM_HEIGHT;
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    renderWidth = width;

    canvasEl.width = width * dpr;
    canvasEl.height = height * dpr;
    canvasEl.setCssProps({
      width: `${width}px`,
      height: `${height}px`,
    });

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
  };

  const renderWaveform = () => {
    resizeCanvas();

    const width = renderWidth;
    const height = WAVEFORM_HEIGHT;
    ctx.clearRect(0, 0, width, height);

    if (!peaks || peaks.length === 0) {
      const style = getComputedStyle(options.hostEl);
      const baseColor = style.getPropertyValue('--background-modifier-border').trim() || '#999';
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = 1;
      const middle = Math.floor(height / 2);
      ctx.beginPath();
      ctx.moveTo(0, middle);
      ctx.lineTo(width, middle);
      ctx.stroke();
      return;
    }

    const style = getComputedStyle(options.hostEl);
    const idleColor = style.getPropertyValue('--text-muted').trim() || '#8a8a8a';
    const playedColor = style.getPropertyValue('--interactive-accent').trim() || '#5b8cff';

    const progress = options.audio.duration > 0
      ? Math.max(0, Math.min(1, options.audio.currentTime / options.audio.duration))
      : 0;
    const playedIndex = Math.floor(progress * peaks.length);

    const gap = 1;
    const totalGap = (peaks.length - 1) * gap;
    const barWidth = Math.max(1, Math.floor((width - totalGap) / peaks.length));
    const effectiveWidth = (barWidth * peaks.length) + totalGap;
    const offsetX = Math.max(0, Math.floor((width - effectiveWidth) / 2));
    const middle = Math.floor(height / 2);
    const maxBarHeight = Math.max(8, Math.floor(height / 2) - 2);

    for (let i = 0; i < peaks.length; i++) {
      const peak = peaks[i];
      const barHeight = Math.max(2, Math.floor(peak * maxBarHeight));
      const x = offsetX + (i * (barWidth + gap));
      const y = middle - barHeight;
      ctx.fillStyle = i <= playedIndex ? playedColor : idleColor;
      ctx.fillRect(x, y, barWidth, barHeight * 2);
    }
  };

  const onSeekFromWaveform = (event: MouseEvent) => {
    if (!options.audio.duration || Number.isNaN(options.audio.duration)) {
      return;
    }
    const rect = canvasEl.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    options.audio.currentTime = ratio * options.audio.duration;
    scheduleRender();
  };

  const onAudioProgress = () => {
    scheduleRender();
  };

  const onWindowResize = () => {
    scheduleRender();
  };
  window.addEventListener('resize', onWindowResize);

  canvasEl.addEventListener('click', onSeekFromWaveform);
  options.audio.addEventListener('timeupdate', onAudioProgress);
  options.audio.addEventListener('seeked', onAudioProgress);
  options.audio.addEventListener('play', onAudioProgress);
  options.audio.addEventListener('pause', onAudioProgress);
  options.audio.addEventListener('ended', onAudioProgress);

  void loadPeaks();

  async function loadPeaks(): Promise<void> {
    try {
      const cached = PEAK_CACHE.get(options.filePath);
      if (cached) {
        peaks = cached;
        hideStatus();
        scheduleRender();
        return;
      }

      const binary = await options.readBinary(options.filePath);
      if (destroyed) {
        return;
      }

      if (binary.byteLength > maxSizeBytes) {
        updateStatus(`音频>${maxSizeMB}MB，已跳过波形`);
        containerEl.removeClass('is-loading');
        scheduleRender();
        return;
      }

      const computedPeaks = await extractPeaks(binary, TARGET_BAR_COUNT);
      if (destroyed) {
        return;
      }

      if (computedPeaks.length === 0) {
        updateStatus('无法解析波形');
        containerEl.removeClass('is-loading');
        scheduleRender();
        return;
      }

      peaks = computedPeaks;
      PEAK_CACHE.set(options.filePath, computedPeaks);
      hideStatus();
      scheduleRender();
    } catch (err) {
      console.error('Lecture Recorder: 波形加载失败', err);
      updateStatus('波形加载失败');
      containerEl.removeClass('is-loading');
      scheduleRender();
    }
  }

  return () => {
    destroyed = true;
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    window.removeEventListener('resize', onWindowResize);
    canvasEl.removeEventListener('click', onSeekFromWaveform);
    options.audio.removeEventListener('timeupdate', onAudioProgress);
    options.audio.removeEventListener('seeked', onAudioProgress);
    options.audio.removeEventListener('play', onAudioProgress);
    options.audio.removeEventListener('pause', onAudioProgress);
    options.audio.removeEventListener('ended', onAudioProgress);
    containerEl.remove();
  };
}

async function extractPeaks(
  arrayBuffer: ArrayBuffer,
  barCount: number,
): Promise<number[]> {
  const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    return [];
  }

  const context = new AudioContextCtor();
  try {
    const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
    const channelData = decoded.getChannelData(0);
    if (!channelData || channelData.length === 0) {
      return [];
    }

    const buckets = Math.max(24, barCount);
    const bucketSize = Math.max(1, Math.floor(channelData.length / buckets));
    const peaks: number[] = [];

    for (let i = 0; i < buckets; i++) {
      const start = i * bucketSize;
      const end = i === buckets - 1
        ? channelData.length
        : Math.min(channelData.length, start + bucketSize);
      let max = 0;
      const stride = Math.max(1, Math.floor((end - start) / 120));
      for (let j = start; j < end; j += stride) {
        const value = Math.abs(channelData[j] || 0);
        if (value > max) {
          max = value;
        }
      }
      peaks.push(max);
    }

    const maxPeak = Math.max(...peaks, 0.0001);
    return peaks.map(v => Math.max(0, Math.min(1, v / maxPeak)));
  } finally {
    await context.close();
  }
}
