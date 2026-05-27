/** 秒数 → m:ss；超过 1 小时为 h:mm:ss */
export function formatDurationSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '—'
  const total = Math.round(sec)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

/** music-metadata 的 bitrate（bps）→ 可读比特率 */
export function formatBitrateBps(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return '—'
  const kbps = Math.round(bps / 1000)
  return `${kbps} kbps`
}

export function formatBitrateKbps(kbps: number): string {
  if (!Number.isFinite(kbps) || kbps <= 0) return '—'
  return `${Math.round(kbps)} kbps`
}

/** 位深（bit） */
export function formatBitsPerSample(bits: number): string {
  if (!Number.isFinite(bits) || bits <= 0) return '—'
  return `${Math.round(bits)} bit`
}

/** 文件大小（字节）→ B / KB / MB … */
export function formatFileSize(bytes: unknown): string {
  const n =
    typeof bytes === 'number' && Number.isFinite(bytes)
      ? bytes
      : typeof bytes === 'string'
        ? Number.parseFloat(bytes.trim())
        : NaN
  if (!Number.isFinite(n) || n <= 0) return '—'
  const KB = 1024
  const MB = KB * 1024
  const GB = MB * 1024
  const TB = GB * 1024

  const format = (value: number, unit: string): string => {
    const digits = value >= 100 ? 1 : 2
    return `${value.toFixed(digits)} ${unit}`
  }

  if (n >= TB) return format(n / TB, 'TB')
  if (n >= GB) return format(n / GB, 'GB')
  if (n >= MB) return format(n / MB, 'MB')
  if (n >= KB) return format(n / KB, 'KB')
  return `${Math.round(n)} B`
}

/** 采样率（Hz）→ 可读频率 */
export function formatSampleRateHz(hz: number): string {
  if (!Number.isFinite(hz) || hz <= 0) return '—'
  if (hz >= 1000) {
    return `${(hz / 1000).toFixed(hz % 1000 === 0 ? 0 : 1)} kHz`
  }
  return `${Math.round(hz)} Hz`
}

function positiveNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value
  }
  if (typeof value === 'string') {
    const n = Number.parseFloat(value.trim())
    if (Number.isFinite(n) && n > 0) return n
  }
  return undefined
}

/** 将 format 对象中的原始数值格式化为展示字符串 */
export function formatMetaFieldFromRaw(key: string, value: unknown): string | undefined {
  if (key === 'duration') {
    const sec = positiveNumber(value)
    if (sec !== undefined) return formatDurationSeconds(sec)
  }
  if (key === 'bitrate') {
    const bps = positiveNumber(value)
    if (bps !== undefined) return formatBitrateBps(bps)
  }
  if (key === 'sampleRate') {
    const hz = positiveNumber(value)
    if (hz !== undefined) return formatSampleRateHz(hz)
  }
  if (key === 'bitsPerSample') {
    const bits = positiveNumber(value)
    if (bits !== undefined) return formatBitsPerSample(bits)
  }
  return undefined
}

/** 已序列化的 meta 字段再格式化（兼容旧缓存中的裸数字） */
export function formatMetaFieldDisplay(key: string, raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return raw

  if (key === 'duration') {
    if (/^\d+:\d{2}(:\d{2})?$/.test(trimmed)) return trimmed
    const sec = Number.parseFloat(trimmed)
    if (Number.isFinite(sec) && sec > 0) return formatDurationSeconds(sec)
  }

  if (key === 'bitrate') {
    if (/kbps|mbps|bps/i.test(trimmed)) return trimmed
    const n = Number.parseFloat(trimmed)
    if (Number.isFinite(n) && n > 0) {
      return n >= 1000 ? formatBitrateBps(n) : formatBitrateKbps(n)
    }
  }

  if (key === 'sampleRate') {
    if (/hz|khz/i.test(trimmed)) return trimmed
    const hz = Number.parseFloat(trimmed)
    if (Number.isFinite(hz) && hz > 0) {
      return hz >= 1000 ? formatSampleRateHz(hz) : formatSampleRateHz(hz * 1000)
    }
  }

  if (key === 'bitsPerSample') {
    if (/bit/i.test(trimmed)) return trimmed
    const bits = Number.parseFloat(trimmed)
    if (Number.isFinite(bits) && bits > 0) return formatBitsPerSample(bits)
  }

  return raw
}
