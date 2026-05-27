import { AUDIO_META_NORMAL_FORMAT_KEYS } from './audioMetaLabels'

/** 目录文件列表种类 */
export type FileListKind = 'source' | 'decode'

/** 可配置的表格列 ID */
export type FileListColumnId =
  | 'fileName'
  | 'ext'
  | 'platform'
  | 'sizeBytes'
  | 'birthtimeMs'
  | 'mtimeMs'
  | 'hasLrc'
  | 'inSearchTarget'
  | 'bitrate'
  | 'duration'
  | 'sampleRate'
  | 'channels'
  | 'codec'
  | 'bitsPerSample'
  | 'title'
  | 'artist'
  | 'album'
  | 'genre'
  | 'year'

export type FileListColumnCategory = 'basic' | 'time' | 'audio' | 'tag'

export interface FileListColumnDef {
  id: FileListColumnId
  label: string
  category: FileListColumnCategory
  kinds: FileListKind[]
}

export const FILE_LIST_COLUMN_DEFS: FileListColumnDef[] = [
  { id: 'fileName', label: '文件名', category: 'basic', kinds: ['source', 'decode'] },
  { id: 'ext', label: '格式', category: 'basic', kinds: ['source', 'decode'] },
  { id: 'platform', label: '平台', category: 'basic', kinds: ['decode'] },
  { id: 'sizeBytes', label: '大小', category: 'basic', kinds: ['source', 'decode'] },
  { id: 'hasLrc', label: '歌词', category: 'basic', kinds: ['source'] },
  {
    id: 'inSearchTarget',
    label: '库中已有',
    category: 'basic',
    kinds: ['decode']
  },
  { id: 'birthtimeMs', label: '创建时间', category: 'time', kinds: ['source', 'decode'] },
  { id: 'mtimeMs', label: '修改时间', category: 'time', kinds: ['source', 'decode'] },
  { id: 'bitrate', label: '比特率', category: 'audio', kinds: ['source'] },
  { id: 'duration', label: '时长', category: 'audio', kinds: ['source'] },
  { id: 'sampleRate', label: '采样率', category: 'audio', kinds: ['source'] },
  { id: 'channels', label: '声道', category: 'audio', kinds: ['source'] },
  { id: 'codec', label: '编码', category: 'audio', kinds: ['source'] },
  { id: 'bitsPerSample', label: '位深', category: 'audio', kinds: ['source'] },
  { id: 'title', label: '标题', category: 'tag', kinds: ['source'] },
  { id: 'artist', label: '艺术家', category: 'tag', kinds: ['source'] },
  { id: 'album', label: '专辑', category: 'tag', kinds: ['source'] },
  { id: 'genre', label: '流派', category: 'tag', kinds: ['source'] },
  { id: 'year', label: '年份', category: 'tag', kinds: ['source'] }
]

const COLUMN_ID_SET = new Set<string>(
  FILE_LIST_COLUMN_DEFS.map((d) => d.id)
)

export interface FileListColumnsSettings {
  source: FileListColumnId[]
  decode: FileListColumnId[]
}

export function createDefaultFileListColumns(): FileListColumnsSettings {
  return {
    source: [
      'fileName',
      'ext',
      'sizeBytes',
      'hasLrc',
      ...AUDIO_META_NORMAL_FORMAT_KEYS
    ],
    decode: [
      'fileName',
      'inSearchTarget',
      'platform',
      'ext',
      'birthtimeMs',
      'sizeBytes'
    ]
  }
}

function filterValidColumns(
  ids: unknown,
  kind: FileListKind
): FileListColumnId[] {
  if (!Array.isArray(ids)) return []
  const allowed = new Set(
    FILE_LIST_COLUMN_DEFS.filter((d) => d.kinds.includes(kind)).map(
      (d) => d.id
    )
  )
  const seen = new Set<FileListColumnId>()
  const out: FileListColumnId[] = []
  for (const raw of ids) {
    if (typeof raw !== 'string' || !COLUMN_ID_SET.has(raw)) continue
    const id = raw as FileListColumnId
    if (!allowed.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/**
 * 将默认列合并进已保存配置：保留用户顺序，按默认顺序插入缺失的新列。
 */
function mergeMissingColumns(
  saved: FileListColumnId[],
  defaults: FileListColumnId[]
): FileListColumnId[] {
  const out = [...saved]
  const seen = new Set(saved)
  for (const id of defaults) {
    if (seen.has(id)) continue
    const defaultIdx = defaults.indexOf(id)
    let insertAt = out.length
    for (let i = defaultIdx - 1; i >= 0; i--) {
      const prevIdx = out.indexOf(defaults[i]!)
      if (prevIdx >= 0) {
        insertAt = prevIdx + 1
        break
      }
    }
    out.splice(insertAt, 0, id)
    seen.add(id)
  }
  return out
}

export function normalizeFileListColumns(raw: unknown): FileListColumnsSettings {
  const defaults = createDefaultFileListColumns()
  if (!raw || typeof raw !== 'object') return defaults
  const obj = raw as Record<string, unknown>
  const source = filterValidColumns(obj.source, 'source')
  const decode = filterValidColumns(obj.decode, 'decode')
  return {
    source:
      source.length > 0
        ? mergeMissingColumns(source, defaults.source)
        : defaults.source,
    decode:
      decode.length > 0
        ? mergeMissingColumns(decode, defaults.decode)
        : defaults.decode
  }
}

export function columnsForKind(
  settings: FileListColumnsSettings,
  kind: FileListKind
): FileListColumnId[] {
  return kind === 'source' ? settings.source : settings.decode
}

export const FILE_LIST_COLUMN_CATEGORY_LABELS: Record<
  FileListColumnCategory,
  string
> = {
  basic: '基础',
  time: '时间',
  audio: '音频参数',
  tag: '标签信息'
}
