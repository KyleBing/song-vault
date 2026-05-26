<script setup lang="ts">
import {
  NButton,
  NDataTable,
  NEmpty,
  NIcon,
  NInput,
  NProgress,
  NSpin,
  NTag,
  NTooltip,
  NTree,
  useMessage,
  type DataTableColumns,
  type TreeOption
} from 'naive-ui'
import {
  ArrowBack,
  FolderOpen,
  Key,
  Play,
  Refresh,
  TrashOutline
} from '@vicons/ionicons5'
import { storeToRefs } from 'pinia'
import { computed, h, onMounted, ref, watch } from 'vue'
import { useLayoutStore } from '@renderer/stores/layout'
import { decryptMusicBatch } from '@renderer/lib/musicDecryptClient'
import type { PathFilterRule } from '@shared/appConfig'
import { PLATFORM_LABELS, classifyEncryptedExtension } from '@shared/musicFormats'
import type { MusicDecryptBatchResult } from '@shared/musicDecryptJob'
import type { DirAudioFileItem } from '@shared/sourceDirBrowse'
import { pathFilterRulesForSave } from '@shared/pathFilters'
import { relativeToRoots } from '@renderer/utils/displayPath'
import MusicDecryptHelpModal from '@renderer/components/MusicDecryptHelpModal.vue'
import { storage } from '@unlock/utils/storage'

const decodeSourceDirs = defineModel<string[]>('decodeSourceDirs', {
  required: true
})

const props = defineProps<{
  pathFilterRules: PathFilterRule[]
}>()

const emit = defineEmits<{
  close: []
}>()

const message = useMessage()
const layoutStore = useLayoutStore()
const { insets } = storeToRefs(layoutStore)
const maxHeightForTable = computed(() => insets.value.windowHeight - 105)

const treeData = ref<TreeOption[]>([])
const selectedKeys = ref<string[]>([])
const selectedDir = ref<string | null>(null)
const dirFiles = ref<DirAudioFileItem[]>([])
const selectedFileKeys = ref<string[]>([])
const filesLoading = ref(false)
const treeRevision = ref(0)

/** 待解密队列（可跨目录累积） */
const decryptQueue = ref<string[]>([])
const outputDir = ref('')
const decrypting = ref(false)
const decryptProgress = ref({ done: 0, total: 0 })
const lastResult = ref<MusicDecryptBatchResult | null>(null)

const browseRoots = computed(() => [...decodeSourceDirs.value])
const filtersForApi = computed(() =>
  pathFilterRulesForSave(props.pathFilterRules)
)

const canDecrypt = computed(
  () => decryptQueue.value.length > 0 && !!outputDir.value.trim() && !decrypting.value
)

function dirIcon() {
  return h(NIcon, { size: 16, class: 'tree-dir-icon' }, () => h(FolderOpen))
}

function rebuildTree(): void {
  treeData.value = decodeSourceDirs.value.map((root) => {
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

async function loadDirFiles(dirPath: string): Promise<void> {
  filesLoading.value = true
  selectedFileKeys.value = []
  try {
    dirFiles.value = await window.electronAPI.listDirEncryptedMusicFiles({
      dirPath,
      browseRoots: browseRoots.value,
      pathFilterRules: filtersForApi.value
    })
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
    selectedFileKeys.value = []
  }
}

function shortPath(p: string): string {
  return relativeToRoots(p, decodeSourceDirs.value)
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

const fileColumns = computed<DataTableColumns<DirAudioFileItem>>(() => [
  { type: 'selection' },
  {
    title: '文件名',
    key: 'fileName',
    minWidth: 180,
    render(row) {
      return pathCell(row.filePath, row.fileName)
    }
  },
  {
    title: '平台',
    key: 'ext',
    width: 88,
    render(row) {
      return platformCell(row)
    }
  },
  {
    title: '格式',
    key: 'ext2',
    width: 72,
    render(row) {
      return `.${row.ext}`
    }
  }
])

const queueColumns = computed<
  DataTableColumns<{ filePath: string; status?: string }>
>(() => [
  {
    title: '待解密',
    key: 'filePath',
    minWidth: 200,
    render(row) {
      const name = row.filePath.split(/[/\\]/).pop() ?? row.filePath
      return pathCell(row.filePath, name)
    }
  },
  {
    title: '状态',
    key: 'status',
    width: 100,
    render(row) {
      if (!row.status) return '—'
      return row.status
    }
  }
])

const queueRows = computed(() => {
  const statusByPath = new Map<string, string>()
  if (lastResult.value) {
    for (const o of lastResult.value.outcomes) {
      statusByPath.set(
        o.inputPath,
        o.ok ? '成功' : `失败: ${o.message ?? ''}`
      )
    }
  }
  return decryptQueue.value.map((filePath) => ({
    filePath,
    status: statusByPath.get(filePath)
  }))
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
  if (dir) outputDir.value = dir
}

function clearQueue(): void {
  decryptQueue.value = []
  lastResult.value = null
}

async function startDecrypt(): Promise<void> {
  if (!canDecrypt.value) return
  decrypting.value = true
  lastResult.value = null
  decryptProgress.value = { done: 0, total: decryptQueue.value.length }
  try {
    const config = await storage.getAll()
    const result = await decryptMusicBatch(
      [...decryptQueue.value],
      outputDir.value.trim(),
      config,
      (done, total) => {
        decryptProgress.value = { done, total }
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
  }
}

const progressPercent = computed(() => {
  const { done, total } = decryptProgress.value
  if (!total) return 0
  return Math.round((done / total) * 100)
})

watch(
  decodeSourceDirs,
  () => {
    rebuildTree()
    if (
      selectedDir.value &&
      !decodeSourceDirs.value.some((r) =>
        selectedDir.value!.toLowerCase().startsWith(r.toLowerCase())
      )
    ) {
      selectedDir.value = null
      selectedKeys.value = []
      dirFiles.value = []
    }
  },
  { deep: true }
)

onMounted(() => {
  rebuildTree()
})
</script>

<template>
  <div class="decode-page">
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

        <div class="sidebar-scroll">
          <p v-if="!decodeSourceDirs.length" class="decode-hint">
            请先在「设置」中添加加密音乐浏览目录，再在左侧目录树中选择文件。
          </p>

          <section class="output-section">
            <label class="field-label">保存到</label>
            <div class="output-row">
              <NInput
                v-model:value="outputDir"
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
          </section>

          <section v-if="decryptQueue.length" class="queue-section">
            <div class="queue-head">
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
            <NDataTable
              :columns="queueColumns"
              :data="queueRows"
              :max-height="180"
              size="small"
              striped
            />
          </section>
        </div>

        <p class="sidebar-foot-note">
          内置 unlock-music 解密 · JOOX 需在 localStorage 配置 UUID
        </p>
      </aside>

      <section class="browser-pane">
        <div class="browser-split">
          <div class="tree-pane">
            <div class="pane-toolbar">
              <span class="pane-title">目录</span>
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
            </div>
            <NTree
              v-if="treeData.length"
              :key="treeRevision"
              block-line
              selectable
              :data="treeData"
              :selected-keys="selectedKeys"
              :on-load="onLoadTreeNode"
              @update:selected-keys="onSelectKeys"
            />
            <NEmpty
              v-else
              class="tree-empty"
              description="请在设置中添加浏览目录"
              size="small"
            />
          </div>

          <div class="files-pane">
            <div class="pane-toolbar">
              <span class="pane-title">
                {{ selectedDir ? shortPath(selectedDir) : '加密文件' }}
              </span>
              <div class="pane-actions">
                <NButton
                  size="small"
                  :disabled="!selectedFileKeys.length"
                  @click="addSelectedToQueue"
                >
                  加入队列
                </NButton>
                <NButton size="small" @click="pickFilesFromDialog">
                  从磁盘选择…
                </NButton>
              </div>
            </div>
            <NSpin :show="filesLoading" class="files-spin">
              <NDataTable
                v-if="dirFiles.length"
                :columns="fileColumns"
                :data="dirFiles"
                :row-key="(row: DirAudioFileItem) => row.filePath"
                v-model:checked-row-keys="selectedFileKeys"
                :max-height="maxHeightForTable"
                size="small"
                striped
              />
              <div v-else class="files-empty">
                <p v-if="selectedDir">当前目录没有可解密的文件</p>
                <p v-else>选择左侧目录查看加密音乐</p>
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

.queue-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
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

.sidebar-foot-note {
  flex-shrink: 0;
  margin: 0;
  padding: 8px 20px 16px;
  font-size: 11px;
  opacity: 0.38;
  line-height: 1.4;
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
  padding: 12px;
  overflow: hidden;
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
</style>
