import {
  splitMetaDisplayValues,
  type AudioFileMetaInfo
} from '@shared/audioFileMeta'
import {
  isMusicBrainzMetaKey,
  isMusicBrainzNativeTag,
  isVorbisNativeTag,
  labelForCommonKey,
  labelForFormatKey,
  labelForMusicBrainzCommonKey,
  labelForMusicBrainzNativeTag,
  labelForNativeTag,
  labelForVorbisNativeTag
} from '@shared/audioMetaLabels'
import {
  formatFileSize,
  formatMetaFieldDisplay
} from '@shared/formatAudioDisplay'

export interface AudioMetaDisplayRow {
  key: string
  label: string
  value: string
}

const REGULAR_FORMAT_KEYS = new Set(['bitrate', 'sampleRate'])
const SKIP_COMMON_KEYS = new Set(['picture', 'artwork', 'title', 'artist', 'album'])

function objectRows(
  obj: Record<string, string> | undefined,
  skipKeys?: Set<string>
): { key: string; value: string }[] {
  if (!obj) return []
  return Object.entries(obj)
    .filter(([key]) => !skipKeys?.has(key))
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map(([key, value]) => ({ key, value }))
}

export function buildRegularMetaRows(
  meta: AudioFileMetaInfo | null | undefined
): AudioMetaDisplayRow[] {
  if (!meta) return []
  const rows: AudioMetaDisplayRow[] = []

  for (const key of ['title', 'artist', 'album'] as const) {
    const raw = meta.common[key]
    if (!raw) continue
    rows.push({
      key,
      label: labelForCommonKey(key),
      value: raw
    })
  }

  const format = meta.format ?? {}
  for (const key of REGULAR_FORMAT_KEYS) {
    const raw = format[key]
    if (!raw) continue
    rows.push({
      key,
      label: labelForFormatKey(key),
      value: formatMetaFieldDisplay(key, raw)
    })
  }

  const bytes = meta.fileSizeBytes
  if (bytes !== undefined && bytes > 0) {
    rows.push({
      key: 'fileSize',
      label: labelForFormatKey('fileSize'),
      value: formatFileSize(bytes)
    })
  }

  return rows
}

export function buildExtendedMetaSections(meta: AudioFileMetaInfo | null | undefined): {
  common: AudioMetaDisplayRow[]
  format: AudioMetaDisplayRow[]
  native: AudioMetaDisplayRow[]
} {
  if (!meta) {
    return { common: [], format: [], native: [] }
  }

  const regularFormatKeys = new Set([
    ...REGULAR_FORMAT_KEYS,
    'fileSize',
    'duration'
  ])

  const common = objectRows(meta.common, SKIP_COMMON_KEYS)
    .filter((row) => !isMusicBrainzMetaKey(row.key))
    .map((row) => ({
      key: row.key,
      label: labelForCommonKey(row.key),
      value: row.value
    }))

  const format = objectRows(meta.format)
    .filter((row) => !regularFormatKeys.has(row.key))
    .map((row) => ({
      key: row.key,
      label: labelForFormatKey(row.key),
      value: formatMetaFieldDisplay(row.key, row.value)
    }))

  const native = (meta.native ?? [])
    .filter((row) => !isVorbisNativeTag(row.id) && !isMusicBrainzNativeTag(row.id))
    .map((row) => ({
      key: row.id,
      label: labelForNativeTag(row.id),
      value: row.value
    }))

  return { common, format, native }
}

export function buildVorbisMetaRows(
  meta: AudioFileMetaInfo | null | undefined
): AudioMetaDisplayRow[] {
  if (!meta) return []
  return (meta.native ?? [])
    .filter((row) => isVorbisNativeTag(row.id) && !isMusicBrainzNativeTag(row.id))
    .sort((a, b) =>
      a.id.localeCompare(b.id, undefined, { sensitivity: 'base' })
    )
    .map((row) => ({
      key: row.id,
      label: labelForVorbisNativeTag(row.id),
      value: row.value
    }))
}

export function buildMusicBrainzMetaRows(
  meta: AudioFileMetaInfo | null | undefined
): AudioMetaDisplayRow[] {
  if (!meta) return []
  const rows: AudioMetaDisplayRow[] = []

  for (const [key, value] of Object.entries(meta.common ?? {})) {
    if (!isMusicBrainzMetaKey(key) || !value) continue
    rows.push({
      key: `common:${key}`,
      label: labelForMusicBrainzCommonKey(key),
      value
    })
  }

  for (const row of meta.native ?? []) {
    if (!isMusicBrainzNativeTag(row.id)) continue
    rows.push({
      key: row.id,
      label: labelForMusicBrainzNativeTag(row.id),
      value: row.value
    })
  }

  return rows.sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
  )
}

export function splitDisplayValues(value: string): string[] {
  const parts = splitMetaDisplayValues(value)
  return parts.length > 0 ? parts : [value]
}
