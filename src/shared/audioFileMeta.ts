import { formatFileSize, formatMetaFieldFromRaw } from './formatAudioDisplay'
import { nativeTagFormatId } from './audioMetaLabels'
import { fileExtensionLower } from './pathLite'

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
  /** 磁盘上的文件大小（字节） */
  fileSizeBytes?: number
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

const EMBEDDED_PICTURE_TAG_IDS = new Set([
  'METADATA_BLOCK_PICTURE',
  'APIC',
  'PIC',
  'covr',
  'COVERART'
])

function isBinaryPayload(value: unknown): value is Buffer | Uint8Array {
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return true
  return value instanceof Uint8Array
}

function binaryPayloadLength(value: unknown): number | undefined {
  if (isBinaryPayload(value)) return value.length
  if (Array.isArray(value)) return value.length
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (obj.type === 'Buffer' && Array.isArray(obj.data)) return obj.data.length
  }
  return undefined
}

function nativeTagBaseId(tagId: string): string {
  const sep = tagId.lastIndexOf(':')
  return sep >= 0 ? tagId.slice(sep + 1) : tagId
}

/** 是否为嵌入封面类原生标签（Vorbis / ID3 APIC / MP4 covr 等） */
export function isEmbeddedPictureNativeTag(tagId: string): boolean {
  const base = nativeTagBaseId(tagId)
  if (EMBEDDED_PICTURE_TAG_IDS.has(base)) return true
  return /PICTURE$/i.test(base)
}

/** 将 music-metadata 的封面块格式化为可读摘要 */
export function formatEmbeddedPicture(value: unknown): string | undefined {
  if (isBinaryPayload(value)) {
    return `嵌入封面 (${formatFileSize(value.length)})`
  }
  if (!value || typeof value !== 'object') return undefined

  const obj = value as Record<string, unknown>
  const len = binaryPayloadLength(obj.data)
  const mime = typeof obj.format === 'string' ? obj.format.trim() : undefined
  const desc = typeof obj.description === 'string' ? obj.description.trim() : undefined

  if (len === undefined && !mime && !desc) return undefined

  const detail: string[] = []
  if (mime) detail.push(mime)
  if (len !== undefined && len > 0) detail.push(formatFileSize(len))

  const title = desc || '嵌入封面'
  return detail.length > 0 ? `${title} (${detail.join(', ')})` : title
}

/** 将单条原生标签值格式化为可展示字符串 */
export function formatNativeTagValue(tagId: string, value: unknown): string | undefined {
  if (isEmbeddedPictureNativeTag(tagId)) {
    return formatEmbeddedPicture(value)
  }
  return formatMetaValue(value)
}

/** 多值元数据字段在 IPC / 展示字符串中的分隔符 */
export const META_MULTI_VALUE_SEP = '; '

/** 将已序列化的多值字段拆成列表（用于 popover 等逐行展示） */
export function splitMetaDisplayValues(value: string): string[] {
  const trimmed = value.trim()
  if (!trimmed) return []
  return trimmed
    .split(META_MULTI_VALUE_SEP)
    .map((part) => part.trim())
    .filter(Boolean)
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
  if (isBinaryPayload(value)) {
    return `二进制数据 (${formatFileSize(value.length)})`
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => formatMetaValue(item))
      .filter((s): s is string => Boolean(s))
    return parts.length > 0 ? parts.join(META_MULTI_VALUE_SEP) : undefined
  }
  if (typeof value === 'object') {
    const embedded = formatEmbeddedPicture(value)
    if (embedded) return embedded
    const obj = value as Record<string, unknown>
    if ('text' in obj) return formatMetaValue(obj.text)
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
    const text = formatMetaFieldFromRaw(key, value) ?? formatMetaValue(value)
    if (text) out[key] = text
  }
  return out
}

/** 原生标签完整 ID（如 vorbis:ARTIST）→ 键名部分 */
export function nativeTagIdFromFullId(fullId: string): string {
  const sep = fullId.indexOf(':')
  return sep >= 0 ? fullId.slice(sep + 1) : fullId
}

const NATIVE_ARTIST_TAG_IDS = new Set(['ARTIST', 'ARTISTS', 'TPE1'])
const NATIVE_TITLE_TAG_IDS = new Set(['TITLE', 'TIT2'])

/** 从 Vorbis / ID3 等原生标签读取艺人、标题（`; ` 连接多值 ARTIST） */
export function nativeArtistTitleFromMeta(meta: AudioFileMetaInfo): {
  artist: string
  title: string
} {
  const artistParts: string[] = []
  const artistSeen = new Set<string>()
  let title = ''
  for (const row of meta.native ?? []) {
    const tagId = nativeTagIdFromFullId(row.id).toUpperCase()
    const value = row.value.trim()
    if (!value) continue
    if (NATIVE_ARTIST_TAG_IDS.has(tagId)) {
      for (const part of splitMetaDisplayValues(value)) {
        const trimmed = part.trim()
        if (!trimmed) continue
        const key = trimmed.toLowerCase()
        if (artistSeen.has(key)) continue
        artistSeen.add(key)
        artistParts.push(trimmed)
      }
    } else if (!title && NATIVE_TITLE_TAG_IDS.has(tagId)) {
      title = value
    }
  }
  return {
    artist: artistParts.length > 0 ? artistParts.join(META_MULTI_VALUE_SEP) : '',
    title
  }
}

function normalizeMetaCompare(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** 原生与 common 层艺人 / 标题是否实质相同 */
export function nativeArtistTitleMatchesCommon(meta: AudioFileMetaInfo): {
  artistMatches: boolean
  titleMatches: boolean
} {
  const common = meta.common ?? {}
  const native = nativeArtistTitleFromMeta(meta)
  const commonArtist = (common.artist || common.artists || '').trim()
  const commonTitle = (common.title || '').trim()
  return {
    artistMatches:
      !native.artist ||
      !commonArtist ||
      normalizeMetaCompare(native.artist) === normalizeMetaCompare(commonArtist),
    titleMatches:
      !native.title ||
      !commonTitle ||
      normalizeMetaCompare(native.title) === normalizeMetaCompare(commonTitle)
  }
}

/** MP3 是否带有文件尾 ID3v1 / ID3v1.1 原生标签 */
export function metaHasId3v1NativeTags(
    meta: AudioFileMetaInfo,
    filePath: string
): boolean {
    if (fileExtensionLower(filePath) !== 'mp3') return false
    return (meta.native ?? []).some((tag) => {
        const formatId = nativeTagFormatId(tag.id)
        return formatId === 'id3v1' || formatId === 'id3v1.1'
    })
}
