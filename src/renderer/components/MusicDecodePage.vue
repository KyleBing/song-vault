<script setup lang="ts">
import {
  NButton,
  NEllipsis,
  NEmpty,
  NIcon,
  NInput,
  NModal,
  NPopconfirm,
  NProgress,
  NScrollbar,
  NSpin,
  NTag,
  NTooltip,
  NTree,
  useMessage,
  type DataTableColumns
} from 'naive-ui'
import {
  ArrowBack,
  FolderOpen,
  Key,
  Play,
  Refresh,
  SearchOutline,
  TrashOutline
} from '@vicons/ionicons5'
import { storeToRefs } from 'pinia'
import { computed, h, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useLayoutStore } from '@renderer/stores/layout'
import { decryptMusicBatch } from '@renderer/lib/musicDecryptClient'
import type { FileListColumnsSettings, PathFilterRule } from '@shared/appConfig'
import { columnsForKind } from '@shared/fileListColumns'
import type { MusicDecryptBatchResult } from '@shared/musicDecryptJob'
import type { DirAudioFileItem } from '@shared/sourceDirBrowse'
import { pathFilterRulesForSave } from '@shared/pathFilters'
import {
  buildSortKeyOptions,
  enrichItemsWithAudioMetrics,
  enrichItemsWithSearchTargetMatches,
  formatFileSize,
  handleDirFileSorterUpdate,
  normalizeDirAudioFileItem,
  sortDirAudioFiles,
  toFiniteNumber,
  useDirFileTableColumns,
  type DirFileSortKey,
  type DirFileSortOrder
} from '@renderer/composables/dirFileTable'
import { useDirFileNameFilter } from '@renderer/composables/useDirFileNameFilter'
import { useLazyDirTree } from '@renderer/composables/useLazyDirTree'
import { wrapAudioMetaHover } from '@renderer/utils/audioMetaHoverCell'
import { useShiftRowSelection } from '@renderer/composables/useShiftRowSelection'
import {
  applySortableHeaders,
  handleTableSorterUpdate,
  sortRows,
  type TableSortOrder
} from '@renderer/composables/useTableHeaderSort'
import { relativeToRoots } from '@renderer/utils/displayPath'
import { openDirInFileManager } from '@renderer/utils/openInFileManager'
import MusicDecryptHelpModal from '@renderer/components/MusicDecryptHelpModal.vue'
import VirtualDataTable from '@renderer/components/VirtualDataTable.vue'
import { storage } from '@unlock/utils/storage'

const decodeSourceDirs = defineModel<string[]>('decodeSourceDirs', {
  required: true
})

const decodeOutputDir = defineModel<string>('decodeOutputDir', {
  required: true,
  default: ''
})

const props = defineProps<{
  searchRoots: string[]
  pathFilterRules: PathFilterRule[]
  fileListColumns: FileListColumnsSettings
}>()

const emit = defineEmits<{
  close: []
}>()

const message = useMessage()
const layoutStore = useLayoutStore()
const { insets } = storeToRefs(layoutStore)
const maxHeightForTable = computed(() => insets.value.windowHeight - 105)

const queueTableWrapRef = ref<HTMLElement | null>(null)
const maxHeightForQueueTable = ref(120)
let queueTableResizeObserver: ResizeObserver | null = null

function syncQueueTableMaxHeight(): void {
  const el = queueTableWrapRef.value
  maxHeightForQueueTable.value = el
    ? Math.max(80, Math.floor(el.clientHeight)) - 100
    : 120
}

function observeQueueTableWrap(el: HTMLElement | null): void {
  queueTableResizeObserver?.disconnect()
  queueTableResizeObserver = null
  if (!el) return
  queueTableResizeObserver = new ResizeObserver(() => syncQueueTableMaxHeight())
  queueTableResizeObserver.observe(el)
  syncQueueTableMaxHeight()
}

watch(queueTableWrapRef, (el) => observeQueueTableWrap(el))

onUnmounted(() => queueTableResizeObserver?.disconnect())

const selectedKeys = ref<string[]>([])
const selectedDir = ref<string | null>(null)
const dirFiles = ref<DirAudioFileItem[]>([])
const filesLoading = ref(false)
const deletingFiles = ref(false)

const {
  selectedKeys: selectedFileKeys,
  clearSelection: clearFileSelection,
  onUpdateCheckedRowKeys: onFileCheckedRowKeysUpdate,
  onTableMouseDown,
  rowProps: fileRowProps
} = useShiftRowSelection((row) => (row as DirAudioFileItem).filePath)

const { fileNameFilter, filterByFileName } = useDirFileNameFilter()

const sortKey = ref<DirFileSortKey>('fileName')
const sortOrder = ref<DirFileSortOrder>('asc')

const sortKeyOptions = computed(() =>
  buildSortKeyOptions('decode', props.fileListColumns)
)

const tableColumns = useDirFileTableColumns(
  'decode',
  computed(() => props.fileListColumns),
  sortKey,
  sortOrder
)

/** 待解密队列（可跨目录累积） */
const decryptQueue = ref<string[]>([])
const decrypting = ref(false)
const decryptProgress = ref({ done: 0, total: 0 })
const decryptTiming = ref({
  lastFileMs: 0,
  elapsedMs: 0
})
const lastResult = ref<MusicDecryptBatchResult | null>(null)

const DECRYPT_ETA_MIN_SAMPLES = 5

function formatElapsedMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const sec = Math.max(1, Math.round(ms / 1000))
  if (sec < 60) return `${sec} 秒`
  const min = Math.floor(sec / 60)
  const remSec = sec % 60
  if (min < 60) {
    return remSec > 0 ? `${min} 分 ${remSec} 秒` : `${min} 分`
  }
  const hour = Math.floor(min / 60)
  const remMin = min % 60
  if (remMin > 0) return `${hour} 小时 ${remMin} 分`
  return `${hour} 小时`
}

function estimateDecryptRemainingMs(
  done: number,
  total: number,
  elapsedMs: number
): number | null {
  if (done < DECRYPT_ETA_MIN_SAMPLES || done >= total || total <= 0) {
    return null
  }
  const remaining = total - done
  return (elapsedMs / done) * remaining
}

watch(
  () => [decryptQueue.value.length, decrypting.value, lastResult.value] as const,
  () => nextTick(() => syncQueueTableMaxHeight())
)

watch(
  () => insets.value.windowHeight,
  () => nextTick(() => syncQueueTableMaxHeight())
)
const showErrorModal = ref(false)
const errorDetail = ref({ filePath: '', message: '' })

function openErrorDetail(filePath: string, message: string): void {
  errorDetail.value = { filePath, message: message || '未知错误' }
  showErrorModal.value = true
}

const browseRoots = computed(() => [...decodeSourceDirs.value])
const filtersForApi = computed(() =>
  pathFilterRulesForSave(props.pathFilterRules)
)

const canDecrypt = computed(
  () =>
    decryptQueue.value.length > 0 &&
    !!decodeOutputDir.value.trim() &&
    !decrypting.value
)

const {
  treeData,
  expandedKeys,
  rebuildTreeRoots,
  onLoadTreeNode,
  onUpdateExpandedKeys,
  ensurePathLoaded
} = useLazyDirTree({
  roots: decodeSourceDirs,
  browseRoots,
  filtersForApi
})

async function rebuildTreeKeepSelection(): Promise<void> {
  const keep = selectedDir.value
  rebuildTreeRoots()
  if (
    keep &&
    decodeSourceDirs.value.some((r) =>
      keep.toLowerCase().startsWith(r.toLowerCase())
    )
  ) {
    selectedKeys.value = [keep]
    selectedDir.value = keep
    await ensurePathLoaded(keep)
  }
}

async function loadDirFiles(dirPath: string): Promise<void> {
  filesLoading.value = true
  clearFileSelection()
  try {
    const items = await window.electronAPI.listDirEncryptedMusicFiles({
      dirPath,
      browseRoots: browseRoots.value,
      pathFilterRules: filtersForApi.value
    })
    let normalized = items.map(normalizeDirAudioFileItem)
    const columnIds = columnsForKind(props.fileListColumns, 'decode')
    normalized = await enrichItemsWithAudioMetrics(
      normalized,
      columnIds,
      sortKey.value
    )
    normalized = await enrichItemsWithSearchTargetMatches(
      normalized,
      props.searchRoots,
      filtersForApi.value
    )
    dirFiles.value = normalized
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    message.error(`加载文件失败: ${msg}`)
    dirFiles.value = []
  } finally {
    filesLoading.value = false
  }
}

function onSelectKeys(keys: string[]): void {
  selectedKeys.value = keys
  const dir = keys[0] ?? null
  selectedDir.value = dir
  if (dir) void loadDirFiles(dir)
  else {
    dirFiles.value = []
    clearFileSelection()
  }
}

function onFileCheckedRowKeys(
  keys: Array<string | number>,
  _rows: object[],
  meta: { row: object | undefined; action: 'check' | 'uncheck' | 'checkAll' | 'uncheckAll' }
): void {
  onFileCheckedRowKeysUpdate(
    keys.map(String),
    orderedFileKeys,
    meta as { row: object | undefined; action: 'check' | 'uncheck' | 'checkAll' | 'uncheckAll' }
  )
}

function fileTableRowProps(row: DirAudioFileItem) {
  return fileRowProps(row, orderedFileKeys)
}

/** 删除文件列表中勾选的加密音乐文件 */
async function deleteSelectedFiles(): Promise<void> {
  if (!selectedFileKeys.value.length) return
  deletingFiles.value = true
  const toDelete = new Set(selectedFileKeys.value)
  try {
    const res = await window.electronAPI.browseDeleteFiles({
      filePaths: [...selectedFileKeys.value],
      browseRoots: browseRoots.value
    })
    if (res.deleted > 0) {
      message.success(`已删除 ${res.deleted} 个文件`)
      decryptQueue.value = decryptQueue.value.filter((p) => !toDelete.has(p))
    }
    if (res.errors.length) {
      message.warning(
        `${res.errors.length} 个文件删除失败：${res.errors[0]?.message ?? ''}`
      )
    }
    clearFileSelection()
    if (selectedDir.value) void loadDirFiles(selectedDir.value)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    message.error(msg)
  } finally {
    deletingFiles.value = false
  }
}

function shortPath(p: string): string {
  return relativeToRoots(p, decodeSourceDirs.value)
}

function openSelectedDirInFileManager(): void {
  void openDirInFileManager(selectedDir.value, message)
}

function fileNameOf(p: string): string {
  return p.split(/[/\\]/).pop() ?? p
}

function queueNameCell(fullPath: string) {
  const name = fileNameOf(fullPath)
  return wrapAudioMetaHover(fullPath, () =>
    h(
      NEllipsis,
      {
        style: { maxWidth: '100%' },
        tooltip: false
      },
      () => name
    )
  )
}

function fileRowKey(row: DirAudioFileItem): string {
  return row.filePath
}

const sortedDirFiles = computed(() =>
  sortDirAudioFiles(
    filterByFileName(dirFiles.value),
    sortKey.value,
    sortOrder.value
  )
)

const orderedFileKeys = computed(() =>
  sortedDirFiles.value.map((row) => row.filePath)
)

function onDirFileSorterUpdate(
  sorter: Parameters<typeof handleDirFileSorterUpdate>[0]
): void {
  handleDirFileSorterUpdate(sorter, sortKey, sortOrder)
}

const queueSortKey = ref<'filePath' | 'status'>('filePath')
const queueSortOrder = ref<TableSortOrder>('asc')

function compareQueueRow(
  a: { filePath: string; status?: 'success' | 'failed' },
  b: { filePath: string; status?: 'success' | 'failed' },
  key: string
): number {
  if (key === 'status') {
    const rank = (s?: 'success' | 'failed') =>
      s === 'failed' ? 2 : s === 'success' ? 1 : 0
    return rank(a.status) - rank(b.status)
  }
  const aName = a.filePath.split(/[/\\]/).pop() ?? a.filePath
  const bName = b.filePath.split(/[/\\]/).pop() ?? b.filePath
  return aName.localeCompare(bName, undefined, { sensitivity: 'base' })
}

function onQueueSorterUpdate(
  sorter: Parameters<typeof handleTableSorterUpdate>[0]
): void {
  handleTableSorterUpdate(sorter, queueSortKey, queueSortOrder, 'filePath')
}

const queueColumns = computed(() => {
  const columns: DataTableColumns<{
    filePath: string
    status?: 'success' | 'failed'
    errorMessage?: string
  }> = [
    {
      title: '待解密',
      key: 'filePath',
      minWidth: 120,
      render(row) {
        return queueNameCell(row.filePath)
      }
    },
    {
      title: '状态',
      key: 'status',
      width: 72,
      align: 'center',
      render(row) {
        if (row.status === 'success') {
          return h('div', { class: 'table-status-cell' }, [
            h(NTag, { type: 'success', size: 'small', round: true }, () => '成功')
          ])
        }
        if (row.status === 'failed') {
          return h('div', { class: 'table-status-cell' }, [
            h(
              NTag,
              {
                type: 'error',
                size: 'small',
                round: true,
                class: 'status-tag-clickable',
                onClick: () =>
                  openErrorDetail(row.filePath, row.errorMessage ?? '未知错误')
              },
              () => '失败'
            )
          ])
        }
        return h('div', { class: 'table-status-cell' }, '—')
      }
    }
  ]
  return applySortableHeaders(columns, {
    sortKey: queueSortKey.value,
    sortOrder: queueSortOrder.value,
    isSortable: (key) => key === 'filePath' || key === 'status',
    compare: (key) => (a, b) => compareQueueRow(a, b, key)
  })
})

const queueRows = computed(() => {
  const outcomeByPath = new Map<
    string,
    MusicDecryptBatchResult['outcomes'][number]
  >()
  if (lastResult.value) {
    for (const o of lastResult.value.outcomes) {
      outcomeByPath.set(o.inputPath, o)
    }
  }
  const rows = decryptQueue.value.map((filePath) => {
    const outcome = outcomeByPath.get(filePath)
    if (!outcome) {
      return { filePath, status: undefined as 'success' | 'failed' | undefined }
    }
    if (outcome.ok) {
      return { filePath, status: 'success' as const }
    }
    return {
      filePath,
      status: 'failed' as const,
      errorMessage: outcome.message
    }
  })
  return sortRows(rows, queueSortKey.value, queueSortOrder.value, compareQueueRow)
})

function addSelectedToQueue(): void {
  const set = new Set(decryptQueue.value)
  for (const key of selectedFileKeys.value) {
    set.add(key)
  }
  decryptQueue.value = [...set]
  message.success(`已加入 ${selectedFileKeys.value.length} 个文件`)
}

async function pickFilesFromDialog(): Promise<void> {
  const paths = await window.electronAPI.pickMusicFiles()
  if (paths.length === 0) return
  const set = new Set([...decryptQueue.value, ...paths])
  decryptQueue.value = [...set]
  message.success(`已加入 ${paths.length} 个文件`)
}

async function pickOutputDir(): Promise<void> {
  const dir = await window.electronAPI.pickDirectory()
  if (dir) decodeOutputDir.value = dir
}

function clearQueue(): void {
  decryptQueue.value = []
  lastResult.value = null
}

async function startDecrypt(): Promise<void> {
  if (!canDecrypt.value) return
  decrypting.value = true
  lastResult.value = null
  const total = decryptQueue.value.length
  decryptProgress.value = { done: 0, total }
  decryptTiming.value = { lastFileMs: 0, elapsedMs: 0 }
  const startedAt = performance.now()
  let lastCheckpointAt = startedAt
  try {
    const config = await storage.getAll()
    const result = await decryptMusicBatch(
      [...decryptQueue.value],
      decodeOutputDir.value.trim(),
      config,
      (done, batchTotal) => {
        const now = performance.now()
        decryptTiming.value = {
          lastFileMs: now - lastCheckpointAt,
          elapsedMs: now - startedAt
        }
        lastCheckpointAt = now
        decryptProgress.value = { done, total: batchTotal }
      }
    )
    lastResult.value = result
    if (result.failed === 0) {
      message.success(`解密完成，共 ${result.succeeded} 个文件`)
    } else {
      message.warning(
        `完成：成功 ${result.succeeded}，失败 ${result.failed}`
      )
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    message.error(`解密失败: ${msg}`)
  } finally {
    decrypting.value = false
    if (selectedDir.value) {
      void loadDirFiles(selectedDir.value)
    }
  }
}

const progressPercent = computed(() => {
  const { done, total } = decryptProgress.value
  if (!total) return 0
  return Math.round((done / total) * 100)
})

const decryptProgressDetailText = computed(() => {
  const { done, total } = decryptProgress.value
  if (!decrypting.value || total === 0) return ''
  const parts: string[] = [`${done} / ${total}`]
  if (done > 0) {
    parts.push(`本首约 ${formatElapsedMs(decryptTiming.value.lastFileMs)}`)
    parts.push(`已用 ${formatElapsedMs(decryptTiming.value.elapsedMs)}`)
    const remainingMs = estimateDecryptRemainingMs(
      done,
      total,
      decryptTiming.value.elapsedMs
    )
    if (remainingMs != null) {
      parts.push(`预计剩余 ${formatElapsedMs(remainingMs)}`)
    }
  }
  return parts.join(' · ')
})

const selectedDirStats = computed(() => {
  let totalBytes = 0
  let matchedCount = 0
  for (const f of dirFiles.value) {
    totalBytes += toFiniteNumber(f.sizeBytes)
    if (f.sourceAudioChecked && (f.sourceAudioPaths?.length ?? 0) > 0) {
      matchedCount++
    }
  }
  const count = dirFiles.value.length
  return {
    count,
    matchedCount,
    sizeLabel: formatFileSize(totalBytes),
    hasSearchRoots: props.searchRoots.length > 0
  }
})

const selectedDirStatsText = computed(() => {
  const { count, matchedCount, sizeLabel, hasSearchRoots } =
    selectedDirStats.value
  if (filesLoading.value) return '统计加载中…'
  if (count === 0) return '0 个文件'
  let text = `${count} 个 · ${sizeLabel}`
  if (hasSearchRoots) {
    const matchPart =
      matchedCount === count
        ? '均已匹配'
        : matchedCount === 0
          ? '未匹配'
          : `${matchedCount} 已匹配`
    text += ` · ${matchPart}`
  }
  return text
})

watch(
  () =>
    [props.fileListColumns, props.searchRoots, props.pathFilterRules] as const,
  () => {
    if (selectedDir.value) void loadDirFiles(selectedDir.value)
  },
  { deep: true }
)

watch(sortKey, async (key) => {
  if (!dirFiles.value.length) return
  const columnIds = columnsForKind(props.fileListColumns, 'decode')
  dirFiles.value = await enrichItemsWithAudioMetrics(
    dirFiles.value,
    columnIds,
    key
  )
})

watch(sortKeyOptions, (opts) => {
  if (!opts.some((o) => o.value === sortKey.value)) {
    sortKey.value = opts[0]?.value ?? 'fileName'
  }
})

watch(
  decodeSourceDirs,
  () => {
    if (
      selectedDir.value &&
      !decodeSourceDirs.value.some((r) =>
        selectedDir.value!.toLowerCase().startsWith(r.toLowerCase())
      )
    ) {
      selectedDir.value = null
      selectedKeys.value = []
      dirFiles.value = []
      rebuildTreeRoots()
    } else {
      void rebuildTreeKeepSelection()
    }
  },
  { deep: true }
)

onMounted(() => {
  void rebuildTreeKeepSelection()
})
</script>

<template>
  <div class="decode-page">
    <NModal
      v-model:show="showErrorModal"
      preset="card"
      title="解密失败"
      class="decode-error-modal"
      :style="{ width: 'min(560px, 92vw)' }"
      :bordered="false"
      :segmented="{ content: true, footer: false }"
    >
      <p class="error-detail-label">文件</p>
      <p class="error-detail-file">{{ errorDetail.filePath }}</p>
      <p class="error-detail-label">错误信息</p>
      <NScrollbar style="max-height: min(50vh, 360px)">
        <pre class="error-detail-message">{{ errorDetail.message }}</pre>
      </NScrollbar>
    </NModal>

    <div class="workspace">
      <aside class="sidebar">
        <header class="decode-header">
          <NButton quaternary circle @click="emit('close')">
            <template #icon>
              <NIcon :size="20"><ArrowBack /></NIcon>
            </template>
          </NButton>
          <div class="decode-brand">
            <div class="brand-icon">
              <NIcon :size="22"><Key /></NIcon>
            </div>
            <div class="brand-text">
              <h1>音乐解码</h1>
              <p>音乐文件解密</p>
            </div>
            <MusicDecryptHelpModal />
          </div>
        </header>

        <div
          class="sidebar-scroll"
          :class="{
            'sidebar-scroll--has-queue':
              decryptQueue.length > 0 || lastResult
          }"
        >
          <p v-if="!decodeSourceDirs.length" class="decode-hint">
            请先在「设置」中添加加密音乐浏览目录，再在左侧目录树中选择文件。
          </p>

          <section class="output-section">
            <label class="field-label">保存到</label>
            <div class="output-row">
              <NInput
                v-model:value="decodeOutputDir"
                placeholder="选择解密后文件的保存文件夹"
                size="small"
                readonly
              />
              <NButton size="small" @click="pickOutputDir">
                <template #icon>
                  <NIcon><FolderOpen /></NIcon>
                </template>
                浏览
              </NButton>
            </div>
          </section>

          <section class="toolbar">
            <NButton
              block
              type="primary"
              size="medium"
              :disabled="!canDecrypt"
              :loading="decrypting"
              @click="startDecrypt"
            >
              <template #icon>
                <NIcon><Play /></NIcon>
              </template>
              开始解密 ({{ decryptQueue.length }})
            </NButton>
            <NProgress
              v-if="decrypting"
              type="line"
              :percentage="progressPercent"
              :show-indicator="true"
              style="margin-top: 8px"
            />
            <p
              v-if="decrypting && decryptProgressDetailText"
              class="decrypt-progress-detail"
            >
              {{ decryptProgressDetailText }}
            </p>
          </section>

          <section
            v-if="decryptQueue.length || lastResult"
            class="queue-section"
          >
            <div v-if="decryptQueue.length" class="queue-head">
              <span class="queue-title">待解密队列</span>
              <NButton
                quaternary
                size="tiny"
                :disabled="decrypting"
                @click="clearQueue"
              >
                <template #icon>
                  <NIcon :size="14"><TrashOutline /></NIcon>
                </template>
                清空
              </NButton>
            </div>
            <div
              v-if="decryptQueue.length"
              ref="queueTableWrapRef"
              class="queue-table-wrap"
            >
              <VirtualDataTable
                :columns="queueColumns"
                :data="queueRows"
                :max-height="maxHeightForQueueTable"
                size="small"
                striped
                @update:sorter="onQueueSorterUpdate"
              />
            </div>
            <p v-if="lastResult" class="decrypt-result-stats">
              <span class="decrypt-result-label">解密完成</span>
              <NTag
                type="success"
                size="small"
                round
                :bordered="false"
              >
                成功 {{ lastResult.succeeded }}
              </NTag>
              <NTag
                v-if="lastResult.failed > 0"
                type="error"
                size="small"
                round
                :bordered="false"
              >
                失败 {{ lastResult.failed }}
              </NTag>
              <span
                v-if="lastResult.failed > 0"
                class="decrypt-result-hint"
              >
                失败项可点队列「失败」查看原因
              </span>
            </p>
          </section>
        </div>
      </aside>

      <section class="browser-pane">
        <div class="browser-split">
          <div class="tree-pane">
            <div class="pane-toolbar">
              <span class="pane-title">目录</span>
              <div class="pane-toolbar-actions">
                <NTooltip>
                  <template #trigger>
                    <NButton
                      quaternary
                      size="tiny"
                      :disabled="!selectedDir"
                      @click="openSelectedDirInFileManager"
                    >
                      <template #icon>
                        <NIcon :size="16"><FolderOpen /></NIcon>
                      </template>
                    </NButton>
                  </template>
                  在文件管理器中打开
                </NTooltip>
                <NTooltip>
                  <template #trigger>
                    <NButton
                      quaternary
                      size="tiny"
                      :disabled="!selectedDir"
                      @click="selectedDir && loadDirFiles(selectedDir)"
                    >
                      <template #icon>
                        <NIcon :size="16"><Refresh /></NIcon>
                      </template>
                    </NButton>
                  </template>
                  刷新当前目录文件列表
                </NTooltip>
              </div>
            </div>
            <div class="tree-body">
              <NTree
                v-if="treeData.length"
                block-line
                selectable
                :data="treeData"
                :expanded-keys="expandedKeys"
                :selected-keys="selectedKeys"
                :on-load="onLoadTreeNode"
                @update:expanded-keys="onUpdateExpandedKeys"
                @update:selected-keys="onSelectKeys"
              />
              <NEmpty
                v-else
                class="tree-empty"
                description="请在设置中添加浏览目录"
                size="small"
              />
            </div>
            <footer v-if="selectedDir" class="tree-foot">
              <NTooltip trigger="hover" :style="{ maxWidth: '420px' }">
                <template #trigger>
                  <p class="dir-stats">{{ selectedDirStatsText }}</p>
                </template>
                <template v-if="selectedDirStats.hasSearchRoots">
                  当前目录（不含子文件夹）：{{ selectedDirStats.count }}
                  个可解密文件，合计 {{ selectedDirStats.sizeLabel }}，{{
                    selectedDirStats.matchedCount
                  }}
                  个在搜索目标中已有同名音频
                </template>
                <template v-else>
                  当前目录（不含子文件夹）：{{ selectedDirStats.count }}
                  个可解密文件，合计 {{ selectedDirStats.sizeLabel }}
                </template>
              </NTooltip>
            </footer>
          </div>

          <div class="files-pane">
            <div class="pane-toolbar">
              <div class="pane-toolbar-leading">
                <span class="pane-title">
                  {{ selectedDir ? shortPath(selectedDir) : '加密文件' }}
                </span>
                <NInput
                  v-model:value="fileNameFilter"
                  class="file-name-filter"
                  size="small"
                  clearable
                  placeholder="搜索文件名"
                  :disabled="!selectedDir"
                >
                  <template #prefix>
                    <NIcon :size="14" class="filter-prefix-icon">
                      <SearchOutline />
                    </NIcon>
                  </template>
                </NInput>
              </div>
              <div class="pane-actions files-head-actions">
                <NButton
                  size="small"
                  type="primary"
                  :disabled="!selectedFileKeys.length"
                  @click="addSelectedToQueue"
                >
                  加入队列 ({{ selectedFileKeys.length }})
                </NButton>
                <NPopconfirm
                  :disabled="!selectedFileKeys.length"
                  @positive-click="deleteSelectedFiles"
                >
                  <template #trigger>
                    <NButton
                      size="small"
                      type="error"
                      secondary
                      :disabled="!selectedFileKeys.length"
                      :loading="deletingFiles"
                    >
                      <template #icon>
                        <NIcon><TrashOutline /></NIcon>
                      </template>
                      删除选中 ({{ selectedFileKeys.length }})
                    </NButton>
                  </template>
                  确定删除选中的 {{ selectedFileKeys.length }} 个文件？
                </NPopconfirm>
                <NButton size="small" @click="pickFilesFromDialog">
                  从磁盘选择…
                </NButton>
              </div>
            </div>
            <NSpin :show="filesLoading" class="files-spin">
              <div
                v-if="selectedDir && sortedDirFiles.length"
                class="files-table-wrap"
                @mousedown.capture="onTableMouseDown"
              >
                <VirtualDataTable
                  :columns="tableColumns"
                  :data="sortedDirFiles"
                  :row-key="fileRowKey"
                  :checked-row-keys="selectedFileKeys"
                  :row-props="fileTableRowProps"
                  :max-height="maxHeightForTable"
                  size="small"
                  striped
                  @update:checked-row-keys="onFileCheckedRowKeys"
                  @update:sorter="onDirFileSorterUpdate"
                />
              </div>
              <div v-else class="files-empty">
                <p
                  v-if="
                    selectedDir &&
                    !filesLoading &&
                    dirFiles.length > 0 &&
                    sortedDirFiles.length === 0
                  "
                >
                  没有匹配「{{ fileNameFilter.trim() }}」的文件
                </p>
                <p v-else-if="selectedDir && !filesLoading">
                  当前目录没有可解密的文件
                </p>
                <p v-else-if="!selectedDir">选择左侧目录查看加密音乐</p>
              </div>
            </NSpin>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '../styles/variables' as *;

.decode-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.workspace {
  display: flex;
  flex: 1;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.sidebar {
  width: 340px;
  height: 100%;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border-right: 1px solid $border-sidebar;
  background: $surface-sidebar;
}

.decode-header {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  padding: 16px 12px 8px;
  flex-shrink: 0;
}

.decode-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;

  :deep(.help-trigger) {
    margin-left: auto;
    flex-shrink: 0;
  }
}

.brand-icon {
  width: 40px;
  height: 40px;
  border-radius: $radius-icon;
  background: linear-gradient(135deg, #e8a87c 0%, #c38d9e 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
}

.brand-text {
  h1 {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
  }

  p {
    margin: 2px 0 0;
    font-size: 12px;
    opacity: 0.55;
  }
}

.sidebar-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;

  &--has-queue {
    overflow: hidden;

    .queue-section {
      flex: 1;
      min-height: 0;
    }
  }
}

.decode-hint {
  margin: 0;
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.45;
  border-radius: $radius-icon;
  border: 1px dashed $border-subtle;
  background: var(--app-surface-raised);
  opacity: 0.75;
}

.field-label {
  display: block;
  font-size: 12px;
  opacity: 0.55;
  margin-bottom: 6px;
}

.output-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.output-section {
  padding-top: 4px;
}

.toolbar {
  padding-top: 4px;
}

.decrypt-progress-detail {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.4;
  opacity: 0.65;
}

.queue-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.queue-table-wrap {
  flex: 1;
  min-height: 0;
}

.decrypt-result-stats {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  margin: 0;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.4;
  border-radius: $radius-icon;
  background: var(--app-surface-raised);
  border: 1px solid $border-subtle;
}

.decrypt-result-label {
  font-weight: 600;
  opacity: 0.85;
}

.decrypt-result-hint {
  opacity: 0.55;
  font-size: 11px;
}

.queue-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.queue-title {
  font-size: 13px;
  font-weight: 600;
}

.browser-pane {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.browser-split {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.tree-pane {
  width: 260px;
  flex-shrink: 0;
  border-right: 1px solid $border-subtle;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 12px 12px 0;
  overflow: hidden;
}

.tree-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  margin: 0 -4px;
  padding: 0 4px;

  :deep(.n-tree) {
    font-size: 13px;
  }
}

.tree-foot {
  flex-shrink: 0;
  margin: 0 -12px;
  padding: 3px 12px 5px;
  border-top: 1px solid $border-subtle;
}

.dir-stats {
  margin: 0;
  font-size: 11px;
  line-height: 1.25;
  opacity: 0.6;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: default;
}

.files-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 12px 16px;
  min-height: 0;
}

.pane-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
  flex-shrink: 0;
}

.pane-toolbar-leading {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.file-name-filter {
  flex: 1;
  min-width: 120px;
  max-width: 240px;
}

.filter-prefix-icon {
  opacity: 0.45;
}

.pane-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.pane-title {
  font-size: 13px;
  font-weight: 600;
  opacity: 0.8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pane-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.files-spin {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;

  :deep(.n-spin-container),
  :deep(.n-spin-content) {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
}

.files-table-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tree-empty {
  padding: 24px 0;
}

.files-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.45;
  font-size: 13px;
}

.path-cell {
  font-family: $font-mono;
  font-size: 12px;
}

.queue-section :deep(.n-data-table-td) {
  white-space: nowrap;
}

.queue-section :deep(.n-data-table-td[data-col-key='filePath']) {
  overflow: hidden;
  max-width: 0;

  .n-ellipsis {
    display: block;
    min-width: 0;
  }
}

.size-cell,
.metric-cell,
.time-cell {
  font-family: $font-mono;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

:deep(.n-data-table-th[data-col-key='status']),
:deep(.n-data-table-td[data-col-key='status']) {
  text-align: center;
}

.status-tag-clickable {
  cursor: pointer;
}

.error-detail-label {
  margin: 0 0 6px;
  font-size: 12px;
  opacity: 0.55;
}

.error-detail-file {
  margin: 0 0 16px;
  font-family: $font-mono;
  font-size: 12px;
  line-height: 1.5;
  word-break: break-all;
}

.error-detail-message {
  margin: 0;
  padding: 12px 14px;
  font-family: $font-mono;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  border-radius: $radius-icon;
  background: var(--app-surface-raised);
  border: 1px solid $border-subtle;
}

.time-cell,
.size-cell {
  font-family: $font-mono;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.files-head-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
}
</style>
