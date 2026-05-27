/** 单条原生标签（如 ID3v2 / Vorbis comment） */
export interface AudioNativeTagEntry {
  id: string
  value: string
}

/** 从音频文件解析出的完整元数据（经 IPC 传输的纯 JSON） */
export interface AudioFileMetaInfo {
  filePath: string
  /** 是否成功解析到可读标签 */
  ok: boolean
  /** 加密格式、非音频、解析失败等说明 */
  message?: string
  coverDataUrl?: string
  common: Record<string, string>
  format: Record<string, string>
  native: AudioNativeTagEntry[]
}

export function emptyAudioFileMeta(filePath: string, message?: string): AudioFileMetaInfo {
  return {
    filePath,
    ok: false,
    message,
    common: {},
    format: {},
    native: []
  }
}

function formatMetaValue(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'string') {
    const t = value.trim()
    return t || undefined
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => formatMetaValue(item))
      .filter((s): s is string => Boolean(s))
    return parts.length > 0 ? parts.join('; ') : undefined
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if ('text' in obj) return formatMetaValue(obj.text)
    if ('name' in obj && 'data' in obj) return formatMetaValue(obj.name)
  }
  return undefined
}

/** 将 music-metadata 的 common / format 对象展平为可展示的键值对 */
export function recordFromMetaObject(
  obj: Record<string, unknown> | undefined,
  skipKeys: ReadonlySet<string> = new Set(['picture'])
): Record<string, string> {
  const out: Record<string, string> = {}
  if (!obj) return out
  for (const [key, value] of Object.entries(obj)) {
    if (skipKeys.has(key)) continue
    const text = formatMetaValue(value)
    if (text) out[key] = text
  }
  return out
}
