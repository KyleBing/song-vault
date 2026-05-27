import type { AudioFileMetrics } from '@shared/audioFileMetrics'
import type { DirAudioFileItem } from '@shared/sourceDirBrowse'

export function formatBitrate(metrics: AudioFileMetrics | undefined): string {
  const kbps = metrics?.bitrateKbps
  if (typeof kbps !== 'number' || kbps <= 0) return '—'
  return `${kbps} kbps`
}

export function formatDuration(metrics: AudioFileMetrics | undefined): string {
  const sec = metrics?.durationSec
  if (typeof sec !== 'number' || sec <= 0) return '—'
  const total = Math.round(sec)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatSampleRate(metrics: AudioFileMetrics | undefined): string {
  const hz = metrics?.sampleRateHz
  if (typeof hz !== 'number' || hz <= 0) return '—'
  if (hz >= 1000) return `${(hz / 1000).toFixed(hz % 1000 === 0 ? 0 : 1)} kHz`
  return `${hz} Hz`
}

export function formatChannels(metrics: AudioFileMetrics | undefined): string {
  const ch = metrics?.channels
  if (typeof ch !== 'number' || ch <= 0) return '—'
  if (ch === 1) return '单声道'
  if (ch === 2) return '立体声'
  return `${ch} 声道`
}

export function formatCodec(metrics: AudioFileMetrics | undefined): string {
  const c = metrics?.codec?.trim()
  return c || '—'
}

export function formatBitsPerSample(
  metrics: AudioFileMetrics | undefined
): string {
  const bits = metrics?.bitsPerSample
  if (typeof bits !== 'number' || bits <= 0) return '—'
  return `${bits} bit`
}

export function formatTag(value: string | number | undefined): string {
  if (value === undefined || value === null) return '—'
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return '—'
    return String(value)
  }
  const t = value.trim()
  return t || '—'
}

export function mergeAudioMetricsIntoItems(
  items: DirAudioFileItem[],
  byPath: Record<string, AudioFileMetrics>
): DirAudioFileItem[] {
  return items.map((item) => {
    const audio = byPath[item.filePath]
    if (!audio) return item
    return { ...item, audio }
  })
}
