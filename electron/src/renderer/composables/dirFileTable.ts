import { NIcon, NTag, NTooltip, type DataTableColumns, type TagProps } from 'naive-ui'
import { FolderOpen } from '@vicons/ionicons5'
import { computed, h, type ComputedRef, type Ref } from 'vue'
import { needsAudioMetadata } from '@shared/audioFileMetrics'
import {
  columnsForKind,
  type FileListColumnId,
  type FileListKind
} from '@shared/fileListColumns'
import type { FileListColumnsSettings } from '@shared/appConfig'
import type { PathFilterRule } from '@shared/pathFilters'
import { plainFindAudioInSearchRootsParams } from '@renderer/utils/ipcPayload'
import { PLATFORM_LABELS, classifyEncryptedExtension } from '@shared/musicFormats'
import type { DirAudioFileItem } from '@shared/sourceDirBrowse'
import { formatFileTime } from '@renderer/utils/formatFileTime'
import {
  formatBitrate,
  formatBitsPerSample,
  formatChannels,
  formatCodec,
  formatDuration,
  formatSampleRate,
  formatTag
} from '@renderer/utils/formatAudioMetrics'

export type DirFileSortKey =
  | FileListColumnId
  | 'fileName'
  | 'ext'
  | 'sizeBytes'
  | 'birthtimeMs'
  | 'mtimeMs'

export type DirFileSortOrder = 'asc' | 'desc'

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

export function formatSizeMb(bytes: unknown): string {
  const n = toFiniteNumber(bytes)
  if (n <= 0) return '—'
  const mb = n / (1024 * 1024)
  return `${mb.toFixed(2)} MB`
}

function pathCell(full: string, short: string) {
  return h(
    NTooltip,
    { placement: 'top-start', style: { maxWidth: '560px' } },
    {
      trigger: () => h('span', { class: 'path-cell' }, short),
      default: () => full
    }
  )
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
        default: () => '请先在主界面添加「音频搜索目标」'
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

function metricCell(text: string) {
  return h('span', { class: 'metric-cell' }, text)
}

function columnDef(
  id: FileListColumnId,
  listKind: FileListKind
): DataTableColumns<DirAudioFileItem>[number] | null {
  switch (id) {
    case 'fileName':
      return {
        title: '文件名',
        key: 'fileName',
        minWidth: listKind === 'decode' ? 180 : 200,
        ellipsis: { tooltip: false },
        render(row) {
          return pathCell(row.filePath, row.fileName)
        }
      }
    case 'ext':
      return listKind === 'decode'
        ? {
            title: '格式',
            key: 'ext',
            width: 72,
            render(row) {
              return `.${row.ext}`
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
          return metricCell(formatBitrate(row.audio))
        }
      }
    case 'duration':
      return {
        title: '时长',
        key: 'duration',
        width: 72,
        align: 'right',
        render(row) {
          return metricCell(formatDuration(row.audio))
        }
      }
    case 'sampleRate':
      return {
        title: '采样率',
        key: 'sampleRate',
        width: 88,
        align: 'right',
        render(row) {
          return metricCell(formatSampleRate(row.audio))
        }
      }
    case 'channels':
      return {
        title: '声道',
        key: 'channels',
        width: 80,
        render(row) {
          return metricCell(formatChannels(row.audio))
        }
      }
    case 'codec':
      return {
        title: '编码',
        key: 'codec',
        width: 88,
        render(row) {
          return metricCell(formatCodec(row.audio))
        }
      }
    case 'bitsPerSample':
      return {
        title: '位深',
        key: 'bitsPerSample',
        width: 72,
        align: 'right',
        render(row) {
          return metricCell(formatBitsPerSample(row.audio))
        }
      }
    case 'title':
      return {
        title: '标题',
        key: 'title',
        minWidth: 120,
        ellipsis: { tooltip: true },
        render(row) {
          return metricCell(formatTag(row.audio?.title))
        }
      }
    case 'artist':
      return {
        title: '艺术家',
        key: 'artist',
        minWidth: 100,
        ellipsis: { tooltip: true },
        render(row) {
          return metricCell(formatTag(row.audio?.artist))
        }
      }
    case 'album':
      return {
        title: '专辑',
        key: 'album',
        minWidth: 100,
        ellipsis: { tooltip: true },
        render(row) {
          return metricCell(formatTag(row.audio?.album))
        }
      }
    case 'genre':
      return {
        title: '流派',
        key: 'genre',
        width: 88,
        ellipsis: { tooltip: true },
        render(row) {
          return metricCell(formatTag(row.audio?.genre))
        }
      }
    case 'year':
      return {
        title: '年份',
        key: 'year',
        width: 64,
        align: 'right',
        render(row) {
          return metricCell(formatTag(row.audio?.year))
        }
      }
    default:
      return null
  }
}

export function buildDirFileTableColumns(
  listKind: FileListKind,
  settings: FileListColumnsSettings
): DataTableColumns<DirAudioFileItem> {
  const ids = columnsForKind(settings, listKind)
  const cols: DataTableColumns<DirAudioFileItem> = [{ type: 'selection' }]
  for (const id of ids) {
    const col = columnDef(id, listKind)
    if (col) cols.push(col)
  }
  return cols
}

export function sortDirAudioFiles(
  items: DirAudioFileItem[],
  sortKey: DirFileSortKey,
  sortOrder: DirFileSortOrder
): DirAudioFileItem[] {
  const list = [...items]
  const sign = sortOrder === 'asc' ? 1 : -1
  list.sort((a, b) => {
    let cmp = 0
    switch (sortKey) {
      case 'ext': {
        cmp = a.ext.localeCompare(b.ext, undefined, { sensitivity: 'base' })
        if (cmp === 0) {
          cmp = a.fileName.localeCompare(b.fileName, undefined, {
            sensitivity: 'base'
          })
        }
        break
      }
      case 'birthtimeMs':
        cmp = a.birthtimeMs - b.birthtimeMs
        break
      case 'mtimeMs':
        cmp = a.mtimeMs - b.mtimeMs
        break
      case 'sizeBytes':
        cmp = a.sizeBytes - b.sizeBytes
        break
      case 'inSearchTarget': {
        const aHas = (a.sourceAudioPaths?.length ?? 0) > 0 ? 1 : 0
        const bHas = (b.sourceAudioPaths?.length ?? 0) > 0 ? 1 : 0
        cmp = aHas - bHas
        break
      }
      case 'bitrate':
        cmp =
          toFiniteNumber(a.audio?.bitrateKbps) -
          toFiniteNumber(b.audio?.bitrateKbps)
        break
      case 'duration':
        cmp =
          toFiniteNumber(a.audio?.durationSec) -
          toFiniteNumber(b.audio?.durationSec)
        break
      case 'sampleRate':
        cmp =
          toFiniteNumber(a.audio?.sampleRateHz) -
          toFiniteNumber(b.audio?.sampleRateHz)
        break
      case 'channels':
        cmp =
          toFiniteNumber(a.audio?.channels) - toFiniteNumber(b.audio?.channels)
        break
      case 'bitsPerSample':
        cmp =
          toFiniteNumber(a.audio?.bitsPerSample) -
          toFiniteNumber(b.audio?.bitsPerSample)
        break
      case 'codec':
        cmp = formatCodec(a.audio).localeCompare(formatCodec(b.audio), undefined, {
          sensitivity: 'base'
        })
        break
      case 'title':
        cmp = formatTag(a.audio?.title).localeCompare(
          formatTag(b.audio?.title),
          undefined,
          { sensitivity: 'base' }
        )
        break
      case 'artist':
        cmp = formatTag(a.audio?.artist).localeCompare(
          formatTag(b.audio?.artist),
          undefined,
          { sensitivity: 'base' }
        )
        break
      case 'album':
        cmp = formatTag(a.audio?.album).localeCompare(
          formatTag(b.audio?.album),
          undefined,
          { sensitivity: 'base' }
        )
        break
      case 'genre':
        cmp = formatTag(a.audio?.genre).localeCompare(
          formatTag(b.audio?.genre),
          undefined,
          { sensitivity: 'base' }
        )
        break
      case 'year':
        cmp =
          toFiniteNumber(a.audio?.year) - toFiniteNumber(b.audio?.year)
        break
      default:
        cmp = a.fileName.localeCompare(b.fileName, undefined, {
          sensitivity: 'base'
        })
    }
    return cmp * sign
  })
  return list
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
  columnSettings: Ref<FileListColumnsSettings>
): ComputedRef<DataTableColumns<DirAudioFileItem>> {
  return computed(() =>
    buildDirFileTableColumns(listKind, columnSettings.value)
  )
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
