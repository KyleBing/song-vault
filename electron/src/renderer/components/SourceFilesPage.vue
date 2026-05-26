<script setup lang="ts">
import {
  NButton,
  NDataTable,
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
  type DataTableColumns,
  type TagProps,
  type TreeOption
} from 'naive-ui'
import {
  Add,
  ArrowBack,
  ArrowDown,
  ArrowUp,
  CreateOutline,
  FolderOpen,
  Refresh,
  TrashOutline
} from '@vicons/ionicons5'
import { storeToRefs } from 'pinia'
import { computed, h, onMounted, ref, watch } from 'vue'
import { useLayoutStore } from '@renderer/stores/layout'
import type { PathFilterRule } from '@shared/appConfig'
import { isBrowseRoot } from '@shared/sourceDirBrowse'
import type { DirAudioFileItem } from '@shared/sourceDirBrowse'
import { pathFilterRulesForSave } from '@shared/pathFilters'
import { relativeToRoots } from '@renderer/utils/displayPath'

const searchRoots = defineModel<string[]>('searchRoots', { required: true })

const props = defineProps<{
  pathFilterRules: PathFilterRule[]
}>()

const emit = defineEmits<{
  close: []
}>()

const message = useMessage()
const layoutStore = useLayoutStore()
const { insets } = storeToRefs(layoutStore)
const maxHeightForTable = computed(() => insets.value.windowHeight - 165)

const treeData = ref<TreeOption[]>([])
const selectedKeys = ref<string[]>([])
const selectedDir = ref<string | null>(null)
const audioFiles = ref<DirAudioFileItem[]>([])
const selectedFileKeys = ref<string[]>([])
const filesLoading = ref(false)
const treeRevision = ref(0)
const deletingFiles = ref(false)

type FileSortKey = 'fileName' | 'ext' | 'mtimeMs' | 'sizeBytes'
type FileSortOrder = 'asc' | 'desc'

const sortKey = ref<FileSortKey>('fileName')
const sortOrder = ref<FileSortOrder>('asc')

const sortKeyOptions: { label: string; value: FileSortKey }[] = [
  { label: '文件名', value: 'fileName' },
  { label: '文件格式', value: 'ext' },
  { label: '修改时间', value: 'mtimeMs' },
  { label: '文件大小', value: 'sizeBytes' }
]

const browseRoots = computed(() => [...searchRoots.value])
const filtersForApi = computed(() =>
  pathFilterRulesForSave(props.pathFilterRules)
)

/** 目录树节点的文件夹图标渲染 */
function dirIcon() {
  return h(NIcon, { size: 16, class: 'tree-dir-icon' }, () => h(FolderOpen))
}

/** 根据 searchRoots 重建目录树顶层节点 */
function rebuildTree(): void {
  treeData.value = searchRoots.value.map((root) => {
    const name = root.replace(/[/\\]+$/, '').split(/[/\\]/).pop() ?? root
    return {
      key: root,
      label: name,
      isLeaf: false,
      prefix: dirIcon
    }
  })
  treeRevision.value++
}

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

/** 路径规范化（小写、正斜杠）用于比较 */
function pathResolveLower(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase()
}

/** 重建树并尽量保留当前选中目录 */
function rebuildTreeKeepSelection(): void {
  const keep = selectedDir.value
  rebuildTree()
  if (keep && isUnderAnyRoot(keep)) {
    selectedKeys.value = [keep]
    selectedDir.value = keep
  } else {
    selectedKeys.value = []
    selectedDir.value = null
    audioFiles.value = []
    selectedFileKeys.value = []
  }
}

/** 判断路径是否仍位于某一搜索目标根之下 */
function isUnderAnyRoot(target: string): boolean {
  const t = pathResolveLower(target)
  return searchRoots.value.some((r) => {
    const root = pathResolveLower(r)
    return t === root || t.startsWith(`${root}/`)
  })
}

/** 懒加载目录树子节点（经 IPC 读取子文件夹） */
async function onLoadTreeNode(node: TreeOption): Promise<void> {
  const dirPath = String(node.key)
  const children = await window.electronAPI.listSourceDirChildren({
    dirPath,
    browseRoots: browseRoots.value,
    pathFilterRules: filtersForApi.value
  })
  node.children = children.map((c) => ({
    key: c.path,
    label: c.name,
    isLeaf: !c.hasSubdirs,
    prefix: dirIcon
  }))
}

/** 将 IPC 返回值规范为有限数字（避免 undefined / BigInt 导致 NaN） */
function toFiniteNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return 0
}

function normalizeAudioFileItem(item: DirAudioFileItem): DirAudioFileItem {
  return {
    ...item,
    sizeBytes: toFiniteNumber(item.sizeBytes),
    mtimeMs: toFiniteNumber(item.mtimeMs)
  }
}

/** 加载选中目录下的音频文件列表 */
async function loadAudioFiles(dirPath: string): Promise<void> {
  filesLoading.value = true
  selectedFileKeys.value = []
  try {
    const items = await window.electronAPI.listDirAudioFiles({
      dirPath,
      browseRoots: browseRoots.value,
      pathFilterRules: filtersForApi.value
    })
    audioFiles.value = items.map(normalizeAudioFileItem)
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
    selectedFileKeys.value = []
  }
}

/** 相对搜索目标的显示路径 */
function shortPath(p: string): string {
  return relativeToRoots(p, searchRoots.value)
}

/** 表格路径单元格（短路径 + 悬停完整路径） */
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

/** 同级 LRC 列渲染 */
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

/** 文件列表表格行主键 */
function fileRowKey(row: DirAudioFileItem): string {
  return row.filePath
}

const EXT_TAG_TYPE: Record<string, TagProps['type']> = {
  mp3: 'info',
  flac: 'success',
  m4a: 'warning',
  aac: 'error',
  ogg: 'default',
  opus: 'default'
}

/** 音频扩展名标签（mp3 / flac 等区分颜色） */
function extCell(row: DirAudioFileItem) {
  const tagType = EXT_TAG_TYPE[row.ext] ?? 'default'
  return h(
    NTag,
    { type: tagType, size: 'small', round: true, bordered: false },
    () => row.ext.toUpperCase()
  )
}

/** 以 MB 显示文件大小 */
function formatSizeMb(bytes: unknown): string {
  const n = toFiniteNumber(bytes)
  if (n <= 0) return '—'
  const mb = n / (1024 * 1024)
  return `${mb.toFixed(2)} MB`
}

const sortedAudioFiles = computed(() => {
  const list = [...audioFiles.value]
  const sign = sortOrder.value === 'asc' ? 1 : -1
  list.sort((a, b) => {
    let cmp = 0
    switch (sortKey.value) {
      case 'ext': {
        cmp = a.ext.localeCompare(b.ext, undefined, { sensitivity: 'base' })
        if (cmp === 0) {
          cmp = a.fileName.localeCompare(b.fileName, undefined, {
            sensitivity: 'base'
          })
        }
        break
      }
      case 'mtimeMs':
        cmp = a.mtimeMs - b.mtimeMs
        break
      case 'sizeBytes':
        cmp = a.sizeBytes - b.sizeBytes
        break
      default:
        cmp = a.fileName.localeCompare(b.fileName, undefined, {
          sensitivity: 'base'
        })
    }
    return cmp * sign
  })
  return list
})

function toggleSortOrder(): void {
  sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
}

const columns = computed<DataTableColumns<DirAudioFileItem>>(() => [
  { type: 'selection' },
  {
    title: '文件名',
    key: 'fileName',
    minWidth: 200,
    ellipsis: { tooltip: false },
    render(row) {
      return pathCell(row.filePath, row.fileName)
    }
  },
  {
    title: '格式',
    key: 'ext',
    width: 80,
    render(row) {
      return extCell(row)
    }
  },
  {
    title: '大小',
    key: 'fileSize',
    width: 96,
    align: 'right',
    render(row) {
      return h('span', { class: 'size-cell' }, formatSizeMb(row.sizeBytes))
    }
  },
  {
    title: '同级 LRC',
    key: 'hasLrc',
    width: 88,
    render(row) {
      return lrcCell(row)
    }
  }
])

const selectedDirLabel = computed(() => {
  if (!selectedDir.value) return ''
  return shortPath(selectedDir.value) || selectedDir.value
})

const canManageDir = computed(() => !!selectedDir.value)

watch(
  searchRoots,
  () => {
    rebuildTreeKeepSelection()
  },
  { deep: true }
)

watch(
  () => searchRoots.value.length,
  () => {
    if (searchRoots.value.length === 0) {
      selectedKeys.value = []
      selectedDir.value = null
      audioFiles.value = []
      selectedFileKeys.value = []
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
    rebuildTreeKeepSelection()
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
    if (wasRoot) {
      syncSearchRootPath(selectedDir.value, newPath)
    }
    message.success('已重命名')
    selectedKeys.value = [newPath]
    selectedDir.value = newPath
    rebuildTreeKeepSelection()
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
    }
    message.success('文件夹已删除')
    selectedKeys.value = []
    selectedDir.value = null
    audioFiles.value = []
    selectedFileKeys.value = []
    rebuildTree()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    message.error(msg)
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
    selectedFileKeys.value = []
    if (selectedDir.value) void loadAudioFiles(selectedDir.value)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    message.error(msg)
  } finally {
    deletingFiles.value = false
  }
}

/** 刷新目录树与当前目录文件列表 */
function refreshAll(): void {
  rebuildTreeKeepSelection()
  if (selectedDir.value) void loadAudioFiles(selectedDir.value)
}

onMounted(() => {
  rebuildTree()
})
</script>

<template>
  <div class="source-files-page">
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

    <header class="page-header">
      <NButton quaternary circle @click="emit('close')">
        <template #icon>
          <NIcon :size="20"><ArrowBack /></NIcon>
        </template>
      </NButton>
      <div class="header-text">
        <h1>搜索目标管理</h1>
      </div>
      <NButton quaternary size="small" @click="refreshAll">
        <template #icon>
          <NIcon><Refresh /></NIcon>
        </template>
        刷新
      </NButton>
    </header>

    <div class="browse-split">
      <aside class="tree-pane">
        <div class="pane-head">
          <span>目录</span>
          <div class="head-actions">
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
            description="请先在主界面左侧添加音频搜索目标"
            class="tree-empty"
          />
          <NTree
            v-else
            :key="treeRevision"
            block-line
            selectable
            :data="treeData"
            :selected-keys="selectedKeys"
            :on-load="onLoadTreeNode"
            @update:selected-keys="onSelectKeys"
          />
        </div>
      </aside>

      <section class="files-pane">
        <div class="pane-head">
          <span v-if="selectedDir">当前：{{ selectedDirLabel }}</span>
          <span v-else class="pane-head-muted">请选择左侧目录</span>
          <div class="head-actions files-head-actions">
            <template v-if="selectedDir">
              <div class="sort-tabs" role="group" aria-label="排序方式">
                <NButton
                  v-for="opt in sortKeyOptions"
                  :key="opt.value"
                  size="small"
                  :type="sortKey === opt.value ? 'primary' : 'default'"
                  :secondary="sortKey !== opt.value"
                  @click="sortKey = opt.value"
                >
                  {{ opt.label }}
                </NButton>
              </div>
              <NTooltip>
                <template #trigger>
                  <NButton
                    quaternary
                    size="small"
                    class="sort-order-btn"
                    @click="toggleSortOrder"
                  >
                    <template #icon>
                      <NIcon :size="16">
                        <ArrowUp v-if="sortOrder === 'asc'" />
                        <ArrowDown v-else />
                      </NIcon>
                    </template>
                    {{ sortOrder === 'asc' ? '升序' : '降序' }}
                  </NButton>
                </template>
                切换升序 / 降序
              </NTooltip>
            </template>
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
          <NDataTable
            v-if="selectedDir"
            v-model:checked-row-keys="selectedFileKeys"
            :columns="columns"
            :data="sortedAudioFiles"
            :row-key="fileRowKey"
            :max-height="maxHeightForTable"
            size="small"
            striped
          />
          <div v-else class="files-placeholder">
            <NEmpty size="small" description="点击目录树中的文件夹查看音频" />
          </div>
          <p
            v-if="selectedDir && !filesLoading && audioFiles.length === 0"
            class="files-empty-hint"
          >
            该目录下没有音频文件
          </p>
        </NSpin>
      </section>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '../styles/variables' as *;

.source-files-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  flex-shrink: 0;
  border-bottom: 1px solid $border-subtle;
}

.header-text {
  flex: 1;
  min-width: 0;

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

.browse-split {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.tree-pane {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid $border-sidebar;
  background: $surface-sidebar;
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

.pane-head-muted {
  font-weight: 400;
  opacity: 0.5;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.tree-spin,
.files-spin {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px 10px;

  :deep(.n-spin-container),
  :deep(.n-spin-content) {
    min-height: 0;
  }
}

.tree-spin {
  :deep(.n-tree) {
    font-size: 13px;
  }
}

.tree-empty {
  padding: 24px 8px;
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
  font-size: 12px;
}

.size-cell {
  font-family: $font-mono;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.files-head-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.sort-tabs {
  display: inline-flex;
  flex-shrink: 0;
  border: 1px solid $border-subtle;
  border-radius: $radius-icon;
  overflow: hidden;

  :deep(.n-button) {
    border-radius: 0;
    border: none;
    box-shadow: none;

    &:not(:last-child) {
      border-right: 1px solid $border-subtle;
    }
  }
}
</style>
