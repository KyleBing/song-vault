import path from 'path'
import { checkBatchCancelled } from './batchCancel'
import { parseFile } from 'music-metadata'
import {
  emptyAudioFileMetrics,
  type AudioFileMetrics
} from './audioFileMetrics'
import { isDecryptableExtension } from './musicFormats'

function pickString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const t = value.trim()
    return t || undefined
  }
  if (Array.isArray(value) && value.length > 0) {
    return pickString(value[0])
  }
  return undefined
}

function pickYear(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }
  if (typeof value === 'string' && /^\d{4}/.test(value)) {
    return Number.parseInt(value.slice(0, 4), 10)
  }
  return undefined
}

/** 读取单个音频文件的指标；加密格式或解析失败时返回空对象 */
export async function readAudioFileMetrics(
  filePath: string
): Promise<AudioFileMetrics> {
  const ext = path.extname(filePath).slice(1).toLowerCase()
  if (isDecryptableExtension(ext)) {
    return emptyAudioFileMetrics()
  }

  try {
    const meta = await parseFile(filePath, {
      skipCovers: true,
      duration: true
    })
    const fmt = meta.format
    const common = meta.common
    const metrics: AudioFileMetrics = {}

    if (typeof fmt.bitrate === 'number' && fmt.bitrate > 0) {
      metrics.bitrateKbps = Math.round(fmt.bitrate / 1000)
    }
    if (typeof fmt.duration === 'number' && fmt.duration > 0) {
      metrics.durationSec = fmt.duration
    }
    if (typeof fmt.sampleRate === 'number' && fmt.sampleRate > 0) {
      metrics.sampleRateHz = fmt.sampleRate
    }
    if (typeof fmt.numberOfChannels === 'number' && fmt.numberOfChannels > 0) {
      metrics.channels = fmt.numberOfChannels
    }
    if (typeof fmt.bitsPerSample === 'number' && fmt.bitsPerSample > 0) {
      metrics.bitsPerSample = fmt.bitsPerSample
    }
    const codec = pickString(fmt.codec)
    if (codec) metrics.codec = codec

    const title = pickString(common.title)
    if (title) metrics.title = title
    const artist = pickString(common.artist)
    if (artist) metrics.artist = artist
    const album = pickString(common.album)
    if (album) metrics.album = album
    const genre = pickString(common.genre)
    if (genre) metrics.genre = genre
    const year = pickYear(common.year)
    if (year) metrics.year = year

    return metrics
  } catch {
    return emptyAudioFileMetrics()
  }
}

const DEFAULT_CONCURRENCY = 6

/** 批量读取音频指标（限制并发） */
export async function readAudioFileMetricsBatch(
  filePaths: string[],
  concurrency = DEFAULT_CONCURRENCY
): Promise<Record<string, AudioFileMetrics>> {
  const unique = [...new Set(filePaths.filter(Boolean))]
  const out: Record<string, AudioFileMetrics> = {}
  if (unique.length === 0) return out

  let index = 0
  async function worker(): Promise<void> {
    while (index < unique.length) {
      checkBatchCancelled()
      const i = index++
      const p = unique[i]!
      out[p] = await readAudioFileMetrics(p)
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, unique.length) },
    () => worker()
  )
  await Promise.all(workers)
  return out
}
