import { NIcon, NTag, NTooltip, type DataTableColumns, type TagProps } from 'naive-ui'
import { FolderOpen } from '@vicons/ionicons5'
import { computed, h, type ComputedRef, type Ref } from 'vue'
import { useAudioMetaHoverSettingsStore } from '@renderer/stores/audioMetaHoverSettings'
import { needsAudioMetadata } from '@shared/audioFileMetrics'
import {
  columnsForKind,
  type FileListColumnId,
  type FileListKind
} from '@shared/fileListColumns'
import type { FileListColumnsSettings } from '@shared/appConfig'
import type { PathFilterRule } from '@shared/pathFilters'
import { plainFindAudioInSearchRootsParams } from '@renderer/utils/ipcPayload'
import {
  OTHER_ENCRYPTED_EXTENSIONS,
  PLATFORM_LABELS,
  classifyEncryptedExtension
} from '@shared/musicFormats'
import type { DirAudioFileItem } from '@shared/sourceDirBrowse'
import { formatFileTime } from '@renderer/utils/formatFileTime'
import {
  applySortableHeaders,
  handleTableSorterUpdate,
  type TableSortOrder
} from '@renderer/composables/useTableHeaderSort'
import {
  formatBitrate,
  formatBitsPerSample,
  formatChannels,
  formatCodec,
  formatDuration,
  formatSampleRate,
  formatTag
} from '@renderer/utils/formatAudioMetrics'
import {
  audioAwarePathCell,
  wrapAudioMetaHover
} from '@renderer/utils/audioMetaHoverCell'

export type DirFileSortKey =
  | FileListColumnId
  | 'fileName'
  | 'ext'
  | 'sizeBytes'
  | 'birthtimeMs'
  | 'mtimeMs'

export type DirFileSortOrder = TableSortOrder

export function toFiniteNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return 0
}

export function normalizeDirAudioFileItem(
  item: DirAudioFileItem
): DirAudioFileItem {
  return {
    ...item,
    sizeBytes: toFiniteNumber(item.sizeBytes),
    birthtimeMs: toFiniteNumber(item.birthtimeMs),
    mtimeMs: toFiniteNumber(item.mtimeMs),
    audio: item.audio ?? {}
  }
}

/** 按量级选用 B / KB / MB / GB / TB（1024 进制） */
export function formatFileSize(bytes: unknown): string {
  const n = toFiniteNumber(bytes)
  if (n <= 0) return '—'
  const KB = 1024
  const MB = KB * 1024
  const GB = MB * 1024
  const TB = GB * 1024

  const format = (value: number, unit: string): string => {
    const digits = value >= 100 ? 1 : value >= 10 ? 2 : 2
    return `${value.toFixed(digits)} ${unit}`
  }

  if (n >= TB) return format(n / TB, 'TB')
  if (n >= GB) return format(n / GB, 'GB')
  if (n >= MB) return format(n / MB, 'MB')
  if (n >= KB) return format(n / KB, 'KB')
  return `${n} B`
}

/** @deprecated 请用 {@link formatFileSize} */
export function formatSizeMb(bytes: unknown): string {
  return formatFileSize(bytes)
}


const EXT_TAG_TYPE: Record<string, TagProps['type']> = {
  mp3: 'info',
  flac: 'success',
  m4a: 'warning',
  aac: 'error',
  ogg: 'default',
  opus: 'default'
}

function extCell(row: DirAudioFileItem) {
  const tagType = EXT_TAG_TYPE[row.ext] ?? 'default'
  return h(
    NTag,
    { type: tagType, size: 'small', round: true, bordered: false },
    () => row.ext.toUpperCase()
  )
}

function decodeFormatTagType(ext: string): TagProps['type'] {
  const platform = classifyEncryptedExtension(ext)
  if (platform === 'netease') return 'warning'
  if (platform === 'qq') return 'info'
  if (OTHER_ENCRYPTED_EXTENSIONS.has(ext.toLowerCase())) return 'success'
  return 'default'
}

function decodeFormatCell(row: DirAudioFileItem) {
  return h(
    NTag,
    {
      type: decodeFormatTagType(row.ext),
      size: 'small',
      round: true,
      bordered: false
    },
    () => `.${row.ext}`
  )
}

function platformCell(row: DirAudioFileItem) {
  const platform = classifyEncryptedExtension(row.ext)
  if (!platform) {
    return h(NTag, { size: 'small', round: true }, () => row.ext.toUpperCase())
  }
  return h(
    NTag,
    {
      type: platform === 'netease' ? 'warning' : 'info',
      size: 'small',
      round: true
    },
    () => PLATFORM_LABELS[platform]
  )
}

function lrcCell(row: DirAudioFileItem) {
  if (!row.hasLrc) {
    return h(NTag, { size: 'small', round: true }, () => '无')
  }
  return h(
    NTooltip,
    { placement: 'top-start', style: { maxWidth: '560px' } },
    {
      trigger: () =>
        h(NTag, { type: 'success', size: 'small', round: true }, () => '有'),
      default: () => row.lrcPath ?? row.fileName
    }
  )
}

function inSearchTargetCell(row: DirAudioFileItem) {
  if (row.sourceAudioChecked === false) {
    return h(
      NTooltip,
      { placement: 'top' },
      {
        trigger: () =>
          h(NTag, { size: 'small', round: true, type: 'warning' }, () => '未配置'),
        default: () => '请先在「设置」中添加「音频搜索目标」'
      }
    )
  }
  const paths = row.sourceAudioPaths ?? []
  if (paths.length === 0) {
    return h(NTag, { size: 'small', round: true }, () => '无')
  }
  const label = paths.length === 1 ? '有' : `有 (${paths.length})`
  return h(
    NTooltip,
    { placement: 'top-start', style: { maxWidth: '560px' } },
    {
      trigger: () =>
        h(NTag, { type: 'success', size: 'small', round: true }, () => label),
      default: () => paths.join('\n')
    }
  )
}

function metricCell(
  text: string,
  filePath: string | undefined,
  hoverEnabled: boolean
) {
  const inner = () => h('span', { class: 'metric-cell' }, text)
  if (filePath && hoverEnabled) return wrapAudioMetaHover(filePath, inner)
  return inner()
}

function columnDef(
  id: FileListColumnId,
  listKind: FileListKind,
  hoverEnabled: boolean
): DataTableColumns<DirAudioFileItem>[number] | null {
  switch (id) {
    case 'fileName':
      return {
        title: '文件名',
        key: 'fileName',
        minWidth: listKind === 'decode' ? 180 : 200,
        ellipsis: { tooltip: false },
        render(row) {
          return audioAwarePathCell(row.filePath, row.fileName)
        }
      }
    case 'ext':
      return listKind === 'decode'
        ? {
            title: '格式',
            key: 'ext',
            width: 88,
            align: 'center',
            render(row) {
              return h('div', { class: 'table-status-cell' }, [decodeFormatCell(row)])
            }
          }
        : {
            title: '格式',
            key: 'ext',
            width: 80,
            render(row) {
              return extCell(row)
            }
          }
    case 'platform':
      return {
        title: '平台',
        key: 'platform',
        width: 88,
        align: 'center',
        render(row) {
          return h('div', { class: 'table-status-cell' }, [platformCell(row)])
        }
      }
    case 'sizeBytes':
      return {
        title: '大小',
        key: 'sizeBytes',
        width: 96,
        align: 'right',
        render(row) {
          return h('span', { class: 'size-cell' }, formatSizeMb(row.sizeBytes))
        }
      }
    case 'hasLrc':
      return {
        title: '同级 LRC',
        key: 'hasLrc',
        width: 88,
        align: 'center',
        render(row) {
          return h('div', { class: 'table-status-cell' }, [lrcCell(row)])
        }
      }
    case 'inSearchTarget':
      return {
        title: '目标已有',
        key: 'inSearchTarget',
        width: 96,
        align: 'center',
        render(row) {
          return h('div', { class: 'table-status-cell' }, [inSearchTargetCell(row)])
        }
      }
    case 'birthtimeMs':
      return {
        title: '创建时间',
        key: 'birthtimeMs',
        width: 168,
        render(row) {
          return h('span', { class: 'time-cell' }, formatFileTime(row.birthtimeMs))
        }
      }
    case 'mtimeMs':
      return {
        title: '修改时间',
        key: 'mtimeMs',
        width: 168,
        render(row) {
          return h('span', { class: 'time-cell' }, formatFileTime(row.mtimeMs))
        }
      }
    case 'bitrate':
      return {
        title: '比特率',
        key: 'bitrate',
        width: 96,
        align: 'right',
        render(row) {
          return metricCell(formatBitrate(row.audio), row.filePath, hoverEnabled)
        }
      }
    case 'duration':
      return {
        title: '时长',
        key: 'duration',
        width: 72,
        align: 'right',
        render(row) {
          return metricCell(formatDuration(row.audio), row.filePath, hoverEnabled)
        }
      }
    case 'sampleRate':
      return {
        title: '采样率',
        key: 'sampleRate',
        width: 88,
        align: 'right',
        render(row) {
          return metricCell(formatSampleRate(row.audio), row.filePath, hoverEnabled)
        }
      }
    case 'channels':
      return {
        title: '声道',
        key: 'channels',
        width: 80,
        render(row) {
          return metricCell(formatChannels(row.audio), row.filePath, hoverEnabled)
        }
      }
    case 'codec':
      return {
        title: '编码',
        key: 'codec',
        width: 88,
        render(row) {
          return metricCell(formatCodec(row.audio), row.filePath, hoverEnabled)
        }
      }
    case 'bitsPerSample':
      return {
        title: '位深',
        key: 'bitsPerSample',
        width: 72,
        align: 'right',
        render(row) {
          return metricCell(formatBitsPerSample(row.audio), row.filePath, hoverEnabled)
        }
      }
    case 'title':
      return {
        title: '标题',
        key: 'title',
        minWidth: 120,
        ellipsis: { tooltip: true },
        render(row) {
          return metricCell(formatTag(row.audio?.title), row.filePath, hoverEnabled)
        }
      }
    case 'artist':
      return {
        title: '艺术家',
        key: 'artist',
        minWidth: 100,
        ellipsis: { tooltip: true },
        render(row) {
          return metricCell(formatTag(row.audio?.artist), row.filePath, hoverEnabled)
        }
      }
    case 'album':
      return {
        title: '专辑',
        key: 'album',
        minWidth: 100,
        ellipsis: { tooltip: true },
        render(row) {
          return metricCell(formatTag(row.audio?.album), row.filePath, hoverEnabled)
        }
      }
    case 'genre':
      return {
        title: '流派',
        key: 'genre',
        width: 88,
        ellipsis: { tooltip: true },
        render(row) {
          return metricCell(formatTag(row.audio?.genre), row.filePath, hoverEnabled)
        }
      }
    case 'year':
      return {
        title: '年份',
        key: 'year',
        width: 64,
        align: 'right',
        render(row) {
          return metricCell(formatTag(row.audio?.year), row.filePath, hoverEnabled)
        }
      }
    default:
      return null
  }
}

export function buildDirFileTableColumns(
  listKind: FileListKind,
  settings: FileListColumnsSettings,
  hoverEnabled = true
): DataTableColumns<DirAudioFileItem> {
  const ids = columnsForKind(settings, listKind)
  const cols: DataTableColumns<DirAudioFileItem> = [{ type: 'selection' }]
  for (const id of ids) {
    const col = columnDef(id, listKind, hoverEnabled)
    if (col) cols.push(col)
  }
  return cols
}

const SORTABLE_DIR_FILE_KEYS = new Set<DirFileSortKey>([
  'fileName',
  'ext',
  'sizeBytes',
  'birthtimeMs',
  'mtimeMs',
  'inSearchTarget',
  'bitrate',
  'duration',
  'sampleRate',
  'channels',
  'codec',
  'bitsPerSample',
  'title',
  'artist',
  'album',
  'genre',
  'year'
])

export function compareDirAudioFileField(
  a: DirAudioFileItem,
  b: DirAudioFileItem,
  sortKey: DirFileSortKey
): number {
  switch (sortKey) {
    case 'ext': {
      let cmp = a.ext.localeCompare(b.ext, undefined, { sensitivity: 'base' })
      if (cmp === 0) {
        cmp = a.fileName.localeCompare(b.fileName, undefined, {
          sensitivity: 'base'
        })
      }
      return cmp
    }
    case 'birthtimeMs':
      return a.birthtimeMs - b.birthtimeMs
    case 'mtimeMs':
      return a.mtimeMs - b.mtimeMs
    case 'sizeBytes':
      return a.sizeBytes - b.sizeBytes
    case 'inSearchTarget': {
      const aHas = (a.sourceAudioPaths?.length ?? 0) > 0 ? 1 : 0
      const bHas = (b.sourceAudioPaths?.length ?? 0) > 0 ? 1 : 0
      return aHas - bHas
    }
    case 'bitrate':
      return (
        toFiniteNumber(a.audio?.bitrateKbps) -
        toFiniteNumber(b.audio?.bitrateKbps)
      )
    case 'duration':
      return (
        toFiniteNumber(a.audio?.durationSec) -
        toFiniteNumber(b.audio?.durationSec)
      )
    case 'sampleRate':
      return (
        toFiniteNumber(a.audio?.sampleRateHz) -
        toFiniteNumber(b.audio?.sampleRateHz)
      )
    case 'channels':
      return (
        toFiniteNumber(a.audio?.channels) - toFiniteNumber(b.audio?.channels)
      )
    case 'bitsPerSample':
      return (
        toFiniteNumber(a.audio?.bitsPerSample) -
        toFiniteNumber(b.audio?.bitsPerSample)
      )
    case 'codec':
      return formatCodec(a.audio).localeCompare(formatCodec(b.audio), undefined, {
        sensitivity: 'base'
      })
    case 'title':
      return formatTag(a.audio?.title).localeCompare(
        formatTag(b.audio?.title),
        undefined,
        { sensitivity: 'base' }
      )
    case 'artist':
      return formatTag(a.audio?.artist).localeCompare(
        formatTag(b.audio?.artist),
        undefined,
        { sensitivity: 'base' }
      )
    case 'album':
      return formatTag(a.audio?.album).localeCompare(
        formatTag(b.audio?.album),
        undefined,
        { sensitivity: 'base' }
      )
    case 'genre':
      return formatTag(a.audio?.genre).localeCompare(
        formatTag(b.audio?.genre),
        undefined,
        { sensitivity: 'base' }
      )
    case 'year':
      return toFiniteNumber(a.audio?.year) - toFiniteNumber(b.audio?.year)
    default:
      return a.fileName.localeCompare(b.fileName, undefined, {
        sensitivity: 'base'
      })
  }
}

export function sortDirAudioFiles(
  items: DirAudioFileItem[],
  sortKey: DirFileSortKey,
  sortOrder: DirFileSortOrder
): DirAudioFileItem[] {
  const list = [...items]
  const sign = sortOrder === 'asc' ? 1 : -1
  list.sort(
    (a, b) => compareDirAudioFileField(a, b, sortKey) * sign
  )
  return list
}

export function isSortableDirFileColumn(key: string): boolean {
  return SORTABLE_DIR_FILE_KEYS.has(key as DirFileSortKey)
}

export function handleDirFileSorterUpdate(
  sorter: Parameters<typeof handleTableSorterUpdate>[0],
  sortKey: Ref<DirFileSortKey>,
  sortOrder: Ref<DirFileSortOrder>,
  fallbackKey: DirFileSortKey = 'fileName'
): void {
  handleTableSorterUpdate(sorter, sortKey, sortOrder, fallbackKey)
}

export function buildSortKeyOptions(
  listKind: FileListKind,
  settings: FileListColumnsSettings
): { label: string; value: DirFileSortKey }[] {
  const visible = new Set(columnsForKind(settings, listKind))
  const options: { label: string; value: DirFileSortKey }[] = []
  const add = (value: DirFileSortKey, label: string) => {
    options.push({ value, label })
  }
  if (visible.has('fileName')) add('fileName', '文件名')
  if (visible.has('inSearchTarget')) add('inSearchTarget', '目标已有')
  if (visible.has('ext')) add('ext', '文件格式')
  if (visible.has('birthtimeMs')) add('birthtimeMs', '创建时间')
  if (visible.has('mtimeMs')) add('mtimeMs', '修改时间')
  if (visible.has('sizeBytes')) add('sizeBytes', '文件大小')
  if (visible.has('bitrate')) add('bitrate', '比特率')
  if (visible.has('duration')) add('duration', '时长')
  if (visible.has('sampleRate')) add('sampleRate', '采样率')
  if (visible.has('channels')) add('channels', '声道')
  if (visible.has('codec')) add('codec', '编码')
  if (visible.has('bitsPerSample')) add('bitsPerSample', '位深')
  if (visible.has('title')) add('title', '标题')
  if (visible.has('artist')) add('artist', '艺术家')
  if (visible.has('album')) add('album', '专辑')
  if (visible.has('genre')) add('genre', '流派')
  if (visible.has('year')) add('year', '年份')
  if (options.length === 0) add('fileName', '文件名')
  return options
}

export function useDirFileTableColumns(
  listKind: FileListKind,
  columnSettings: Ref<FileListColumnsSettings>,
  sortKey: Ref<DirFileSortKey>,
  sortOrder: Ref<DirFileSortOrder>
): ComputedRef<DataTableColumns<DirAudioFileItem>> {
  const hoverStore = useAudioMetaHoverSettingsStore()
  return computed(() => {
    const hoverEnabled = hoverStore.settings.enabled
    const columns = buildDirFileTableColumns(
      listKind,
      columnSettings.value,
      hoverEnabled
    )
    return applySortableHeaders(columns, {
      sortKey: sortKey.value,
      sortOrder: sortOrder.value,
      isSortable: isSortableDirFileColumn,
      compare: (key) => (a, b) =>
        compareDirAudioFileField(a, b, key as DirFileSortKey)
    })
  })
}

export async function enrichItemsWithAudioMetrics(
  items: DirAudioFileItem[],
  columnIds: FileListColumnId[],
  sortKey: DirFileSortKey
): Promise<DirAudioFileItem[]> {
  if (!needsAudioMetadata(columnIds, sortKey)) return items
  const paths = items.map((i) => i.filePath)
  const byPath = await window.electronAPI.readAudioMetricsBatch(paths)
  return items.map((item) => ({
    ...item,
    audio: byPath[item.filePath] ?? item.audio ?? {}
  }))
}

/** 标记各文件在音频搜索目标中是否已有同名歌名的音频 */
export async function enrichItemsWithSearchTargetMatches(
  items: DirAudioFileItem[],
  searchRoots: string[],
  pathFilterRules: PathFilterRule[]
): Promise<DirAudioFileItem[]> {
  if (items.length === 0) return items
  if (searchRoots.length === 0) {
    return items.map((item) => ({
      ...item,
      sourceAudioPaths: [],
      sourceAudioChecked: false
    }))
  }
  const matches = await window.electronAPI.findAudioInSearchRootsByNames(
    plainFindAudioInSearchRootsParams({
      searchRoots,
      queryNames: items.map((i) => i.fileName),
      pathFilterRules
    })
  )
  return items.map((item) => ({
    ...item,
    sourceAudioPaths: matches[item.fileName] ?? [],
    sourceAudioChecked: true
  }))
}

export function dirIcon() {
  return h(NIcon, { size: 16, class: 'tree-dir-icon' }, () => h(FolderOpen))
}
