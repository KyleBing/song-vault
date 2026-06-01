<script setup lang="ts">
import {
  NButton,
  NEmpty,
  NIcon,
  NInput,
  NModal,
  NPopconfirm,
  NSpin,
  NTag,
  NTooltip,
  NTree,
  useMessage,
} from 'naive-ui'
import {
  Add,
  ArrowForwardOutline,
  CreateOutline,
  FolderOpen,
  Refresh,
  SearchOutline,
  TrashOutline
} from '@vicons/ionicons5'
import { storeToRefs } from 'pinia'
import type { TreeOption } from 'naive-ui'
import { computed, h, onMounted, ref, watch } from 'vue'
import { useLayoutStore } from '@renderer/stores/layout'
import type { FileListColumnsSettings, PathFilterRule } from '@shared/appConfig'
import { columnsForKind } from '@shared/fileListColumns'
import { isBrowseRoot } from '@shared/pathKeys'
import type { BrowseRootCheck, DirAudioFileItem } from '@shared/sourceDirBrowse'
import { pathFilterRulesForSave } from '@shared/pathFilters'
import {
  buildSortKeyOptions,
  enrichItemsWithAudioMetrics,
  enrichItemsWithFileStats,
  handleDirFileSorterUpdate,
  formatFileSize,
  normalizeDirAudioFileItem,
  sortDirAudioFiles,
  toFiniteNumber,
  useDirFileTableColumns,
  type DirFileSortKey,
  type DirFileSortOrder
} from '@renderer/composables/dirFileTable'
import { useDirFileNameFilter } from '@renderer/composables/useDirFileNameFilter'
import {
  TREE_ROOT_INACCESSIBLE_KEY,
  useLazyDirTree
} from '@renderer/composables/useLazyDirTree'
import { useShiftRowSelection } from '@renderer/composables/useShiftRowSelection'
import { plainStringList } from '@renderer/utils/ipcPayload'
import { relativeToRoots } from '@renderer/utils/displayPath'
import { openDirInFileManager } from '@renderer/utils/openInFileManager'
import AudioMetaPanel from '@renderer/components/AudioMetaPanel.vue'
import BrowseDirPickerModal from './BrowseDirPickerModal.vue'
import SelectionPathFooter from '@renderer/components/SelectionPathFooter.vue'
import VirtualDataTable from '@renderer/components/VirtualDataTable.vue'

const searchRoots = defineModel<string[]>('searchRoots', { required: true })

const props = defineProps<{
  pathFilterRules: PathFilterRule[]
  fileListColumns: FileListColumnsSettings
}>()

const message = useMessage()
const layoutStore = useLayoutStore()
const { insets } = storeToRefs(layoutStore)
const maxHeightForTable = computed(() => insets.value.windowHeight - 150)

/** 元数据面板：多选时展示第一个选中文件 */
const metaPanelFilePath = computed(() => selectedFileKeys.value[0] ?? null)

const selectedKeys = ref<string[]>([])
const selectedDir = ref<string | null>(null)
const audioFiles = ref<DirAudioFileItem[]>([])
const filesLoading = ref(false)

const {
  selectedKeys: selectedFileKeys,
  clearSelection: clearFileSelection,
  onUpdateCheckedRowKeys: onFileCheckedRowKeysUpdate,
  onTableMouseDown,
  rowProps: fileRowProps
} = useShiftRowSelection((row) => (row as DirAudioFileItem).filePath)
const deletingFiles = ref(false)
const movingFiles = ref(false)
const moveModalVisible = ref(false)
const moveModalInitialDir = ref<string | null>(null)
/** 移动弹窗内是否新建过文件夹（需在移动完成后同步左侧目录树） */
const movePickerStructureChanged = ref(false)

const { fileNameFilter, filterByFileName } = useDirFileNameFilter()

const sortKey = ref<DirFileSortKey>('fileName')
const sortOrder = ref<DirFileSortOrder>('asc')

const sortKeyOptions = computed(() =>
  buildSortKeyOptions('source', props.fileListColumns)
)

const tableColumns = useDirFileTableColumns(
  'source',
  computed(() => props.fileListColumns),
  sortKey,
  sortOrder
)

const browseRoots = computed(() => [...searchRoots.value])
const filtersForApi = computed(() =>
  pathFilterRulesForSave(props.pathFilterRules)
)

const rootChecks = ref<BrowseRootCheck[]>([])
let validateGeneration = 0
let refreshTreeGeneration = 0

/** 路径规范化（小写、正斜杠）用于比较 */
function pathResolveLower(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase()
}

function normalizeRootKey(p: string): string {
  return pathResolveLower(p.replace(/[/\\]+$/, '') || p)
}

function isSameOrUnderRoot(target: string, root: string): boolean {
  const t = normalizeRootKey(target)
  const r = normalizeRootKey(root)
  return t === r || t.startsWith(`${r}/`)
}

function findOwningRoot(dirPath: string): string | undefined {
  return searchRoots.value.find((r) => isSameOrUnderRoot(dirPath, r))
}

function rootCheckFor(configuredRoot: string): BrowseRootCheck | undefined {
  const key = normalizeRootKey(configuredRoot)
  const idx = searchRoots.value.findIndex((r) => normalizeRootKey(r) === key)
  if (idx < 0) return undefined
  if (rootChecks.value.length !== searchRoots.value.length) {
    return undefined
  }
  const check = rootChecks.value[idx]
  if (!check) return undefined
  if (normalizeRootKey(check.path) !== key) {
    return rootChecks.value.find((c) => normalizeRootKey(c.path) === key)
  }
  return check
}

/** 根目录是否已确认不存在（仅用于树节点提示） */
function isRootMissing(root: string): boolean {
  const check = rootCheckFor(root)
  return !!check && !check.ok
}

/** 是否允许加载子目录；未校验完成前允许加载，仅在校验明确失败时拦截 */
function dirAccessible(dirPath: string): boolean {
  const owningRoot = findOwningRoot(dirPath)
  if (!owningRoot) return false
  const check = rootCheckFor(owningRoot)
  if (!check) return true
  return check.ok
}

function renderTreeLabel(info: { option: TreeOption }): ReturnType<typeof h> {
  const opt = info.option
  const label = String(opt.label ?? '')
  if (opt[TREE_ROOT_INACCESSIBLE_KEY] !== true) {
    return h('span', { class: 'tree-node-label' }, label)
  }
  return h('span', { class: 'tree-node-label tree-node-label--missing-root' }, [
    h('span', { class: 'tree-node-label__name' }, label),
    h(
      NTag,
      {
        size: 'small',
        type: 'warning',
        round: true,
        bordered: true,
        class: 'tree-root-missing-tag'
      },
      () => '路径不存在'
    )
  ])
}

const selectedDirAccessError = computed(() => {
  if (!selectedDir.value) return null
  const owningRoot = findOwningRoot(selectedDir.value)
  if (!owningRoot) return null
  const check = rootCheckFor(owningRoot)
  if (!check || check.ok) return null
  return check.error ?? '目录不存在'
})

async function validateConfiguredRoots(): Promise<void> {
  if (searchRoots.value.length === 0) {
    rootChecks.value = []
    return
  }
  const gen = ++validateGeneration
  try {
    const checks = await window.electronAPI.validateSearchRoots(
      plainStringList(searchRoots.value)
    )
    if (gen !== validateGeneration) return
    rootChecks.value = checks
  } catch (err) {
    if (gen !== validateGeneration) return
    const msg = err instanceof Error ? err.message : String(err)
    console.error('validateSearchRoots failed', err)
    message.error(`校验乐库目录失败: ${msg}`)
  }
}

const {
  treeData,
  expandedKeys,
  rebuildTreeRoots,
  primeAccessibleRoots,
  onLoadTreeNode,
  onUpdateExpandedKeys,
  refreshNode,
  removeNodeFromTree,
  renameNodeInTree,
  mergeExpanded,
  ensurePathLoaded,
  parentDirPath
} = useLazyDirTree({
  roots: searchRoots,
  browseRoots,
  filtersForApi,
  dirAccessible,
  rootMissing: isRootMissing
})

/** 重命名搜索目标根目录后同步配置中的路径 */
function syncSearchRootPath(oldPath: string, newPath: string): void {
  const resolvedOld = oldPath.replace(/\\/g, '/')
  searchRoots.value = searchRoots.value.map((r) => {
    const norm = r.replace(/\\/g, '/')
    return norm.toLowerCase() === resolvedOld.toLowerCase() ? newPath : r
  })
}

/** 从 searchRoots 中移除已删除的根目录路径 */
function removeSearchRoot(targetPath: string): void {
  const resolved = pathResolveLower(targetPath)
  searchRoots.value = searchRoots.value.filter(
    (r) => pathResolveLower(r) !== resolved
  )
}

/** 重建树并尽量保留展开状态与当前选中目录 */
async function rebuildTreeKeepSelection(): Promise<void> {
  const keep = selectedDir.value
  rebuildTreeRoots()
  await primeAccessibleRoots()
  if (keep && isUnderAnyRoot(keep)) {
    selectedKeys.value = [keep]
    selectedDir.value = keep
    if (dirAccessible(keep)) {
      await ensurePathLoaded(keep)
      void loadAudioFiles(keep)
    } else {
      audioFiles.value = []
      clearFileSelection()
    }
  } else {
    selectedKeys.value = []
    selectedDir.value = null
    audioFiles.value = []
    clearFileSelection()
  }
}

/** 判断路径是否仍位于某一搜索目标根之下 */
function isUnderAnyRoot(target: string): boolean {
  return searchRoots.value.some((r) => isSameOrUnderRoot(target, r))
}

/** 加载选中目录下的音频文件列表 */
async function loadAudioFiles(dirPath: string): Promise<void> {
  if (!dirAccessible(dirPath)) {
    audioFiles.value = []
    clearFileSelection()
    return
  }
  filesLoading.value = true
  clearFileSelection()
  try {
    const items = await window.electronAPI.listDirAudioFiles({
      dirPath,
      browseRoots: browseRoots.value,
      pathFilterRules: filtersForApi.value
    })
    let normalized = items.map(normalizeDirAudioFileItem)
    const columnIds = columnsForKind(props.fileListColumns, 'source')
    normalized = await enrichItemsWithFileStats(
      normalized,
      columnIds,
      sortKey.value,
      true
    )
    normalized = await enrichItemsWithAudioMetrics(
      normalized,
      columnIds,
      sortKey.value
    )
    audioFiles.value = normalized
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    message.error(`加载文件列表失败: ${msg}`)
    audioFiles.value = []
  } finally {
    filesLoading.value = false
  }
}

/** 目录树选中变更时刷新右侧文件列表 */
function onSelectKeys(keys: string[]): void {
  selectedKeys.value = keys
  const dir = keys[0] ?? null
  selectedDir.value = dir
  if (dir) {
    void loadAudioFiles(dir)
  } else {
    audioFiles.value = []
    clearFileSelection()
  }
}

/** 相对搜索目标的显示路径 */
function shortPath(p: string): string {
  return relativeToRoots(p, searchRoots.value)
}

/** 文件列表表格行主键 */
function fileRowKey(row: DirAudioFileItem): string {
  return row.filePath
}

const sortedAudioFiles = computed(() =>
  sortDirAudioFiles(
    filterByFileName(audioFiles.value),
    sortKey.value,
    sortOrder.value
  )
)

const orderedFileKeys = computed(() =>
  sortedAudioFiles.value.map((row) => row.filePath)
)

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

function onDirFileSorterUpdate(
  sorter: Parameters<typeof handleDirFileSorterUpdate>[0]
): void {
  handleDirFileSorterUpdate(sorter, sortKey, sortOrder)
}

const selectedDirLabel = computed(() => {
  if (!selectedDir.value) return ''
  return shortPath(selectedDir.value) || selectedDir.value
})

const selectedDirStats = computed(() => {
  let totalBytes = 0
  let lrcCount = 0
  for (const f of audioFiles.value) {
    totalBytes += toFiniteNumber(f.sizeBytes)
    if (f.hasLrc) lrcCount++
  }
  const count = audioFiles.value.length
  return {
    count,
    totalBytes,
    lrcCount,
    sizeLabel: formatFileSize(totalBytes)
  }
})

const selectedDirStatsText = computed(() => {
  const { count, lrcCount, sizeLabel } = selectedDirStats.value
  if (filesLoading.value) return '统计加载中…'
  if (count === 0) return '0 个音频'
  const lrcPart =
    lrcCount === count
      ? '均有歌词'
      : lrcCount === 0
        ? '无歌词'
        : `${lrcCount} 有歌词`
  return `${count} 个 · ${sizeLabel} · ${lrcPart}`
})

const canManageDir = computed(
  () => !!selectedDir.value && dirAccessible(selectedDir.value)
)

function openSelectedDirInFileManager(): void {
  void openDirInFileManager(selectedDir.value, message)
}

watch(
  () => props.fileListColumns,
  () => {
    if (selectedDir.value && dirAccessible(selectedDir.value)) {
      void loadAudioFiles(selectedDir.value)
    }
  },
  { deep: true }
)

watch(sortKey, async (key) => {
  if (!audioFiles.value.length) return
  const columnIds = columnsForKind(props.fileListColumns, 'source')
  let items = audioFiles.value
  items = await enrichItemsWithFileStats(items, columnIds, key)
  audioFiles.value = await enrichItemsWithAudioMetrics(items, columnIds, key)
})

watch(sortKeyOptions, (opts) => {
  if (!opts.some((o) => o.value === sortKey.value)) {
    sortKey.value = opts[0]?.value ?? 'fileName'
  }
})

watch(
  searchRoots,
  () => {
    void refreshLibraryTree()
  },
  { deep: true, immediate: true }
)

watch(
  () => searchRoots.value.length,
  () => {
    if (searchRoots.value.length === 0) {
      selectedKeys.value = []
      selectedDir.value = null
      audioFiles.value = []
      clearFileSelection()
    }
  }
)

const namePromptVisible = ref(false)
const namePromptTitle = ref('')
const namePromptValue = ref('')
let namePromptResolve: ((value: string | null) => void) | null = null

/** 弹出输入框获取文件夹名称（Electron 不支持 window.prompt） */
function promptName(title: string, defaultValue = ''): Promise<string | null> {
  return new Promise((resolve) => {
    namePromptTitle.value = title
    namePromptValue.value = defaultValue
    namePromptResolve = resolve
    namePromptVisible.value = true
  })
}

function finishNamePrompt(value: string | null): void {
  const resolve = namePromptResolve
  namePromptResolve = null
  resolve?.(value)
}

function onNamePromptPositive(): boolean {
  const trimmed = namePromptValue.value.trim()
  if (!trimmed) {
    message.warning('名称不能为空')
    return false
  }
  namePromptVisible.value = false
  finishNamePrompt(trimmed)
  return true
}

function onNamePromptNegative(): void {
  namePromptVisible.value = false
  finishNamePrompt(null)
}

/** 在选中目录下新建子文件夹 */
async function createSubdir(): Promise<void> {
  if (!selectedDir.value) return
  const name = await promptName('请输入新文件夹名称')
  if (!name) return
  try {
    const { path: created } = await window.electronAPI.browseCreateDir({
      parentPath: selectedDir.value,
      name,
      browseRoots: browseRoots.value
    })
    message.success('文件夹已创建')
    await refreshNode(selectedDir.value)
    mergeExpanded(selectedDir.value)
    selectedKeys.value = [created]
    selectedDir.value = created
    void loadAudioFiles(created)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    message.error(msg)
  }
}

/** 重命名选中文件夹；若为根目录则同步 searchRoots */
async function renameDir(): Promise<void> {
  if (!selectedDir.value) return
  const currentName =
    selectedDir.value.replace(/[/\\]+$/, '').split(/[/\\]/).pop() ?? ''
  const newName = await promptName('请输入新名称', currentName)
  if (!newName || newName === currentName) return
  const wasRoot = isBrowseRoot(selectedDir.value, searchRoots.value)
  try {
    const { newPath } = await window.electronAPI.browseRenamePath({
      targetPath: selectedDir.value,
      newName,
      browseRoots: browseRoots.value
    })
    const oldPath = selectedDir.value
    if (wasRoot) {
      syncSearchRootPath(oldPath, newPath)
      rebuildTreeRoots()
    } else {
      renameNodeInTree(oldPath, newPath, newName)
    }
    message.success('已重命名')
    selectedKeys.value = [newPath]
    selectedDir.value = newPath
    await ensurePathLoaded(newPath)
    void loadAudioFiles(newPath)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    message.error(msg)
  }
}

/** 递归删除选中文件夹；若为根目录则从配置中移除 */
async function deleteDir(): Promise<void> {
  if (!selectedDir.value) return
  const target = selectedDir.value
  const wasRoot = isBrowseRoot(target, searchRoots.value)
  try {
    await window.electronAPI.browseDeletePath({
      targetPath: target,
      browseRoots: browseRoots.value
    })
    if (wasRoot) {
      removeSearchRoot(target)
      rebuildTreeRoots()
      selectedKeys.value = []
      selectedDir.value = null
      audioFiles.value = []
      clearFileSelection()
    } else {
      const parent = parentDirPath(target)
      removeNodeFromTree(target)
      if (parent) {
        await refreshNode(parent)
        mergeExpanded(parent)
        selectedKeys.value = [parent]
        selectedDir.value = parent
        void loadAudioFiles(parent)
      } else {
        selectedKeys.value = []
        selectedDir.value = null
        audioFiles.value = []
        clearFileSelection()
      }
    }
    message.success('文件夹已删除')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    message.error(msg)
  }
}

function openMoveModal(): void {
  if (!selectedFileKeys.value.length) return
  const first = selectedFileKeys.value[0]!
  const parent = first.replace(/[/\\][^/\\]+$/, '') || selectedDir.value
  moveModalInitialDir.value = selectedDir.value ?? parent ?? null
  movePickerStructureChanged.value = false
  moveModalVisible.value = true
}

/** 移动完成后同步主目录树（弹窗内新建的文件夹不会出现在主树实例中） */
async function syncMainTreeAfterFileMove(
  destDir: string,
  sourceDirs: Set<string>
): Promise<void> {
  for (const dir of sourceDirs) {
    await refreshNode(dir)
  }
  const parent = parentDirPath(destDir)
  if (parent) {
    await refreshNode(parent)
    mergeExpanded(parent)
  }
  await ensurePathLoaded(destDir)
}

/** 将勾选的音频（及同级歌词）移动到目标目录 */
async function confirmMoveFiles(destDir: string): Promise<void> {
  if (!selectedFileKeys.value.length) return
  const paths = [...selectedFileKeys.value]
  const sourceDirs = new Set(
    paths.map((p) => {
      const sep = p.includes('\\') ? '\\' : '/'
      return p.replace(/[/\\][^/\\]+$/, '')
    })
  )

  movingFiles.value = true
  try {
    const res = await window.electronAPI.browseMoveFiles({
      filePaths: paths,
      destDir,
      browseRoots: browseRoots.value
    })
    if (res.moved > 0) {
      message.success(`已移动 ${res.moved} 个文件`)
    } else if (!res.errors.length) {
      message.info('文件已在目标目录中')
    }
    if (res.errors.length) {
      message.warning(
        `${res.errors.length} 个文件移动失败：${res.errors[0]?.message ?? ''}`
      )
    }
    clearFileSelection()
    if (!movePickerStructureChanged.value) {
      for (const dir of sourceDirs) {
        if (dir !== destDir) void refreshNode(dir)
      }
      void refreshNode(destDir)
    }
    if (selectedDir.value) void loadAudioFiles(selectedDir.value)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    message.error(msg)
  } finally {
    movingFiles.value = false
    if (movePickerStructureChanged.value) {
      await syncMainTreeAfterFileMove(destDir, sourceDirs)
      movePickerStructureChanged.value = false
      if (selectedDir.value) void loadAudioFiles(selectedDir.value)
    }
  }
}

/** 删除文件列表中勾选的音频文件 */
async function deleteSelectedFiles(): Promise<void> {
  if (!selectedFileKeys.value.length) return
  deletingFiles.value = true
  try {
    const res = await window.electronAPI.browseDeleteFiles({
      filePaths: [...selectedFileKeys.value],
      browseRoots: browseRoots.value
    })
    if (res.deleted > 0) {
      message.success(`已删除 ${res.deleted} 个文件`)
    }
    if (res.errors.length) {
      message.warning(
        `${res.errors.length} 个文件删除失败：${res.errors[0]?.message ?? ''}`
      )
    }
    clearFileSelection()
    if (selectedDir.value) void loadAudioFiles(selectedDir.value)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    message.error(msg)
  } finally {
    deletingFiles.value = false
  }
}

/** 刷新目录树与当前目录文件列表 */
async function refreshAll(): Promise<void> {
  await refreshLibraryTree()
}

/** 先同步画出根节点，再校验并加载子目录（与解码页一致，避免树空白） */
async function refreshLibraryTree(): Promise<void> {
  const gen = ++refreshTreeGeneration
  rebuildTreeRoots()
  await validateConfiguredRoots()
  if (gen !== refreshTreeGeneration) return
  await rebuildTreeKeepSelection()
}
</script>

<template>
  <div class="source-files-page">
    <BrowseDirPickerModal
      v-model:show="moveModalVisible"
      :browse-roots="browseRoots"
      :path-filter-rules="pathFilterRules"
      :initial-dir="moveModalInitialDir"
      title="移动到文件夹"
      positive-text="移动"
      @confirm="confirmMoveFiles"
      @structure-changed="movePickerStructureChanged = true"
    />

    <NModal
      v-model:show="namePromptVisible"
      preset="dialog"
      :title="namePromptTitle"
      positive-text="确定"
      negative-text="取消"
      :mask-closable="false"
      @positive-click="onNamePromptPositive"
      @negative-click="onNamePromptNegative"
      @close="onNamePromptNegative"
    >
      <NInput
        v-model:value="namePromptValue"
        placeholder="请输入名称"
        autofocus
        @keyup.enter="onNamePromptPositive"
      />
    </NModal>

    <div class="browse-split">
      <div class="tree-pane">
        <div class="pane-head">
          <span>目录</span>
          <div class="head-actions">
            <NTooltip>
              <template #trigger>
                <NButton quaternary size="tiny" @click="refreshAll">
                  <template #icon>
                    <NIcon :size="16"><Refresh /></NIcon>
                  </template>
                </NButton>
              </template>
              刷新目录树与当前列表
            </NTooltip>
            <NTooltip>
              <template #trigger>
                <NButton
                  quaternary
                  size="tiny"
                  :disabled="!canManageDir"
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
                  :disabled="!canManageDir"
                  @click="createSubdir"
                >
                  <template #icon>
                    <NIcon :size="16"><Add /></NIcon>
                  </template>
                </NButton>
              </template>
              新建子文件夹
            </NTooltip>
            <NTooltip>
              <template #trigger>
                <NButton
                  quaternary
                  size="tiny"
                  :disabled="!canManageDir"
                  @click="renameDir"
                >
                  <template #icon>
                    <NIcon :size="16"><CreateOutline /></NIcon>
                  </template>
                </NButton>
              </template>
              重命名
            </NTooltip>
            <NPopconfirm
              :disabled="!canManageDir"
              @positive-click="deleteDir"
            >
              <template #trigger>
                <NButton quaternary size="tiny" :disabled="!canManageDir">
                  <template #icon>
                    <NIcon :size="16"><TrashOutline /></NIcon>
                  </template>
                </NButton>
              </template>
              确定删除该文件夹及其全部内容？此操作不可恢复。
            </NPopconfirm>
          </div>
        </div>
        <div class="tree-spin">
          <NEmpty
            v-if="!searchRoots.length"
            size="small"
            description="「设置 → 路径」中添加你的乐库目录"
            class="tree-empty"
          />
          <NTree
            v-else-if="treeData.length"
            block-line
            selectable
            :data="treeData"
            :expanded-keys="expandedKeys"
            :selected-keys="selectedKeys"
            :render-label="renderTreeLabel"
            :on-load="onLoadTreeNode"
            @update:expanded-keys="onUpdateExpandedKeys"
            @update:selected-keys="onSelectKeys"
          />
          <NEmpty
            v-else
            size="small"
            description="正在加载目录树…"
            class="tree-empty"
          />
        </div>
        <footer v-if="selectedDir" class="tree-foot">
          <NTooltip trigger="hover" :style="{ maxWidth: '420px' }">
            <template #trigger>
              <p class="dir-stats">{{ selectedDirStatsText }}</p>
            </template>
            当前目录（不含子文件夹）：{{ selectedDirStats.count }} 个音频，
            合计 {{ selectedDirStats.sizeLabel }}，
            {{ selectedDirStats.lrcCount }} 个有同级歌词
          </NTooltip>
        </footer>
        <AudioMetaPanel :file-path="metaPanelFilePath" />
      </div>

      <section class="files-pane">
        <div class="files-toolbar">
          <div class="files-toolbar-leading">
            <span v-if="selectedDir" class="files-toolbar-title">
              当前：{{ selectedDirLabel }}
            </span>
            <span v-else class="files-toolbar-title files-toolbar-title--muted">
              请选择左侧目录
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
          <div class="files-toolbar-actions">
            <NButton
              size="small"
              secondary
              :disabled="!selectedFileKeys.length"
              :loading="movingFiles"
              @click="openMoveModal"
            >
              <template #icon>
                <NIcon><ArrowForwardOutline /></NIcon>
              </template>
              移动到… ({{ selectedFileKeys.length }})
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
              确定删除选中的 {{ selectedFileKeys.length }} 个音频文件？
            </NPopconfirm>
          </div>
        </div>

        <NSpin :show="filesLoading" class="files-spin">
          <div
            v-if="selectedDir && sortedAudioFiles.length"
            class="files-table-wrap"
            @mousedown.capture="onTableMouseDown"
          >
            <VirtualDataTable
              :columns="tableColumns"
              :data="sortedAudioFiles"
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
          <div v-else-if="!selectedDir" class="files-placeholder">
            <NEmpty size="small" description="点击目录树中的文件夹查看音频" />
          </div>
          <div
            v-else-if="selectedDir && selectedDirAccessError"
            class="files-placeholder"
          >
            <NEmpty size="small" :description="selectedDirAccessError" />
          </div>
          <p
            v-if="
              selectedDir &&
              !selectedDirAccessError &&
              !filesLoading &&
              audioFiles.length > 0 &&
              sortedAudioFiles.length === 0
            "
            class="files-empty-hint"
          >
            没有匹配「{{ fileNameFilter.trim() }}」的文件
          </p>
          <p
            v-else-if="
              selectedDir &&
              !selectedDirAccessError &&
              !filesLoading &&
              audioFiles.length === 0
            "
            class="files-empty-hint"
          >
            该目录下没有音频文件
          </p>
        </NSpin>
        <SelectionPathFooter :path="metaPanelFilePath" />
      </section>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '../../styles/variables' as *;

.source-files-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.browse-split {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.tree-pane {
  width: $tree-width;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid $border-subtle;
  background: $surface-tree;
}

.files-pane {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.pane-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  border-bottom: 1px solid $border-subtle;
}

.files-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid $border-subtle;
}

.files-toolbar-leading {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
  flex-wrap: wrap;
}

.files-toolbar-title {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: min(100%, 320px);
}

.files-toolbar-title--muted {
  font-weight: 400;
  opacity: 0.5;
}

.files-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.files-table-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.tree-node-label {
  display: inline;
}

.tree-node-label--missing-root {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
}

.tree-node-label__name {
  flex-shrink: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.5;
}

.tree-root-missing-tag {
  flex-shrink: 0;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.tree-spin,
.files-spin {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 8px 10px;

  :deep(.n-spin-container),
  :deep(.n-spin-content) {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
}

.tree-spin {
  overflow: auto;
}

.files-spin {
  overflow: hidden;
}

.tree-spin {
  :deep(.n-tree) {
    font-size: 13px;
  }
}

.tree-empty {
  padding: 24px 8px;
}

.tree-foot {
  flex-shrink: 0;
  padding: 3px 10px 5px;
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

:deep(.tree-dir-icon) {
  opacity: 0.75;
  margin-right: 2px;
}

.files-placeholder {
  padding: 48px 16px;
}

.files-empty-hint {
  margin: 8px 16px 0;
  font-size: 12px;
  opacity: 0.45;
  text-align: center;
}

.path-cell {
  font-family: $font-mono;
}

.size-cell,
.metric-cell,
.time-cell {
  font-family: $font-mono;
  font-variant-numeric: tabular-nums;
}

.file-name-filter {
  flex: 1;
  min-width: 140px;
  max-width: 320px;
}

.filter-prefix-icon {
  opacity: 0.45;
}

.files-head-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
}
</style>
