<script setup lang="ts">
import { NButton, NIcon, NSpin } from 'naive-ui'
import { Folder, Play, Search } from '@vicons/ionicons5'
import { computed, onMounted, onUnmounted, ref, toRaw, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useLayoutStore } from '@renderer/stores/layout'
import {
  loadAppConfigOnce,
  saveAppConfig
} from '@renderer/lib/appConfigClient'
import { useThemeStore } from '@renderer/stores/theme'
import SettingsPanel from '@renderer/pages/settings/SettingsPanel.vue'
import MusicDecodePage from '@renderer/pages/decode/MusicDecodePage.vue'
import SourceFilesPage from '@renderer/pages/library/SourceFilesPage.vue'
import LibrarySyncPage from '@renderer/pages/sync/LibrarySyncPage.vue'
import LibraryDuplicatesPage from '@renderer/pages/duplicates/LibraryDuplicatesPage.vue'
import MetaTagMismatchPage from '@renderer/pages/metaMismatch/MetaTagMismatchPage.vue'
import {
  APP_CONFIG_VERSION,
  createDefaultAppConfig,
  type AppConfig,
  type DataTableDisplaySettings,
  type FileListColumnsSettings,
  type PathFilterRule
} from '@shared/appConfig'
import { normalizeFileListColumns } from '@shared/fileListColumns'
import {
  dataTableCssVars,
  normalizeDataTableDisplay
} from '@shared/dataTableDisplay'
import { provideDataTableDisplay } from '@renderer/composables/useDataTableDisplay'
import { pathFilterRulesForSave } from '@shared/pathFilters'
import type { AppNavigateTarget } from '@shared/appNavigate'
import type { JobResult } from '@shared/lrcJob'
import {
  countReadyToCopy,
  type SourceSelection
} from '@shared/sourcePick'
import ResultsPanel from '@renderer/pages/lrc/ResultsPanel.vue'
import AudioMetaPanel from '@renderer/components/AudioMetaPanel.vue'
import AudioFileContextMenuHost from '@renderer/components/AudioFileContextMenuHost.vue'
import LyricsViewModalHost from '@renderer/components/LyricsViewModalHost.vue'
import AudioCoverLightbox from '@renderer/components/AudioCoverLightbox.vue'
import ScanAlertsPanel from '@renderer/pages/lrc/ScanAlertsPanel.vue'
import AppTopNav from '@renderer/components/AppTopNav.vue'
import { useAudioPlayerStore } from '@renderer/stores/audioPlayer'
import AboutPage from '@renderer/pages/about/AboutPage.vue'
import { useAdvancedUnlockStore } from '@renderer/stores/advancedUnlock'
import GlobalBatchProgressBar from '@renderer/components/GlobalBatchProgressBar.vue'
import { useBatchTask } from '@renderer/composables/useBatchTask'
import { syncGlobalBatchProgress } from '@renderer/composables/syncGlobalBatchProgress'
const layoutStore = useLayoutStore()
const themeStore = useThemeStore()
const advancedUnlock = useAdvancedUnlockStore()
const audioPlayerStore = useAudioPlayerStore()
const { appearance } = storeToRefs(themeStore)
const { unlocked: advancedUnlocked } = storeToRefs(advancedUnlock)

type AppView = AppNavigateTarget

const activeView = ref<AppView>('library')

/** 从设置页等跳转到工作台 */
function openView(view: 'lrc' | 'decode' | 'library'): void {
  handleAppNavigate(view)
}

/** 顶栏 / 快捷键导航 */
function handleAppNavigate(view: AppNavigateTarget): void {
  if (view === 'decode' && !advancedUnlocked.value) {
    advancedUnlock.setPendingView('decode')
    settingsInitialTab.value = 'advanced'
    activeView.value = 'settings'
    return
  }
  if (view !== 'settings') {
    settingsInitialTab.value = 'general'
  }
  activeView.value = view
}

/** 解锁成功后跳转到待进入页面 */
function onAdvancedUnlocked(): void {
  const pending = advancedUnlock.consumePendingView()
  if (pending) handleAppNavigate(pending)
}

/** 窗口尺寸变化时更新布局 store */
function onWindowResize(): void {
  layoutStore.updateInsets()
}

const lrcDirs = ref<string[]>([])
const searchRoots = ref<string[]>([])
const decodeSourceDirs = ref<string[]>([])
const decodeOutputDir = ref('')
const syncLeftDir = ref('')
const syncLeftAlias = ref('')
const syncRightDir = ref('')
const syncRightAlias = ref('')
const duplicateScanDir = ref('')
const metaMismatchScanDir = ref('')
const pathFilterRules = ref<PathFilterRule[]>([])
const fileListColumns = ref<FileListColumnsSettings>(
  createDefaultAppConfig().fileListColumns
)
const dataTableDisplay = ref<DataTableDisplaySettings>(
  createDefaultAppConfig().dataTableDisplay
)
const dataTableCssStyle = computed(() => dataTableCssVars(dataTableDisplay.value))

provideDataTableDisplay(dataTableDisplay)
/** 已完成启动配置加载，避免恢复时触发多余写入 */
const configHydrated = ref(false)
const loading = ref(false)
const batchTask = useBatchTask()
const lrcBatchTitle = ref('正在处理')

syncGlobalBatchProgress(batchTask, {
  active: () => batchTask.active,
  title: () => lrcBatchTitle.value,
  indeterminate: true
})
const result = ref<JobResult | null>(null)
const lastPreview = ref<JobResult | null>(null)
const sourceSelection = ref<SourceSelection>({ sourceOverrides: {} })
const selectedOrphanKeys = ref<string[]>([])
const selectedOrphanAudioKeys = ref<string[]>([])
const metaPanelFilePath = ref<string | null>(null)
const settingsInitialTab = ref<
  'general' | 'display' | 'paths' | 'sync' | 'filter' | 'advanced'
>('general')

/** 打开设置页并定位到同步设置 */
function openSyncSettings(): void {
  settingsInitialTab.value = 'sync'
  activeView.value = 'settings'
}

const canPreview = computed(
  () => lrcDirs.value.length > 0 && searchRoots.value.length > 0
)

const canExecute = computed(() => {
  if (!lastPreview.value || lastPreview.value.empty) return false
  return (
    countReadyToCopy(lastPreview.value.audioItems, sourceSelection.value) > 0
  )
})

const showResults = computed(
  () => result.value !== null && !result.value.empty
)

/** 调用主进程 runJob：execute 为 false 时仅预览，为 true 时执行复制 */
async function run(execute: boolean, refreshScan = false): Promise<void> {
  if (!canPreview.value) return
  loading.value = true
  lrcBatchTitle.value = execute ? '正在执行复制' : '正在扫描匹配'
  batchTask.begin()
  try {
    const jobResult = await window.electronAPI.runJob({
      lrcDirs: [...toRaw(lrcDirs.value)],
      searchRoots: [...toRaw(searchRoots.value)],
      execute,
      refreshScan: refreshScan || execute,
      sourceOverrides: { ...sourceSelection.value.sourceOverrides },
      preferredSourceDir: sourceSelection.value.preferredSourceDir,
      pathFilterRules: pathFilterRulesForSave(pathFilterRules.value),
      jobId: batchTask.jobId ?? undefined
    })
    result.value = jobResult
    if (!execute) {
      lastPreview.value = jobResult
    }
  } catch (err) {
    if (batchTask.notifyIfCancelled(err)) return
    const msg = err instanceof Error ? err.message : String(err)
    window.alert(`运行失败: ${msg}`)
  } finally {
    batchTask.end()
    loading.value = false
  }
}

/** 重置源歌词选择并运行预览扫描（refreshScan 强制刷新目录缓存） */
function preview(): void {
  sourceSelection.value = { sourceOverrides: {} }
  selectedOrphanKeys.value = []
  selectedOrphanAudioKeys.value = []
  void run(false, true)
}

/** 执行批量歌词复制 */
function executeCopy(): void {
  void run(true)
}

/** 组装当前界面状态对应的持久化配置对象 */
function buildAppConfig(): AppConfig {
  const columns = toRaw(fileListColumns.value)
  return {
    version: APP_CONFIG_VERSION,
    searchRoots: [...toRaw(searchRoots.value)],
    lrcDirs: [...toRaw(lrcDirs.value)],
    decodeSourceDirs: [...toRaw(decodeSourceDirs.value)],
    decodeOutputDir: decodeOutputDir.value.trim(),
    syncLeftDir: syncLeftDir.value.trim(),
    syncLeftAlias: (syncLeftAlias.value ?? '').trim(),
    syncRightDir: syncRightDir.value.trim(),
    syncRightAlias: (syncRightAlias.value ?? '').trim(),
    duplicateScanDir: duplicateScanDir.value.trim(),
    metaMismatchScanDir: metaMismatchScanDir.value.trim(),
    appearance: appearance.value,
    pathFilterRules: pathFilterRulesForSave(toRaw(pathFilterRules.value)),
    fileListColumns: {
      source: [...columns.source],
      decode: [...columns.decode]
    },
    dataTableDisplay: { ...toRaw(dataTableDisplay.value) },
    advancedUnlocked: advancedUnlocked.value
  }
}

/** 将目录与过滤规则等写入磁盘（hydrate 完成前跳过） */
async function persistFolderConfig(): Promise<void> {
  if (!configHydrated.value) return
  try {
    await saveAppConfig(buildAppConfig())
  } catch (err) {
    console.error('保存目录配置失败', err)
  }
}

let unsubscribeAppNavigate: (() => void) | undefined

onMounted(async () => {
  layoutStore.updateInsets()
  window.addEventListener('resize', onWindowResize)
  unsubscribeAppNavigate = window.electronAPI.onAppNavigate(handleAppNavigate)

  try {
    const config = await loadAppConfigOnce()
    searchRoots.value = [...config.searchRoots]
    lrcDirs.value = [...config.lrcDirs]
    decodeSourceDirs.value = [...config.decodeSourceDirs]
    decodeOutputDir.value = config.decodeOutputDir
    syncLeftDir.value = config.syncLeftDir
    syncLeftAlias.value = config.syncLeftAlias
    syncRightDir.value = config.syncRightDir
    syncRightAlias.value = config.syncRightAlias
    duplicateScanDir.value = config.duplicateScanDir
    metaMismatchScanDir.value = config.metaMismatchScanDir
    pathFilterRules.value = [...config.pathFilterRules]
    fileListColumns.value = normalizeFileListColumns(config.fileListColumns)
    dataTableDisplay.value = normalizeDataTableDisplay(config.dataTableDisplay)
    advancedUnlock.hydrateFromConfig(config.advancedUnlocked)
  } catch (err) {
    console.error('加载目录配置失败', err)
  } finally {
    configHydrated.value = true
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', onWindowResize)
  unsubscribeAppNavigate?.()
  audioPlayerStore.dispose()
})

watch(advancedUnlocked, (ok, prev) => {
  if (ok && prev === false) onAdvancedUnlocked()
  else if (!ok && activeView.value === 'decode') {
    activeView.value = 'library'
  }
})

watch(
  [
    searchRoots,
    lrcDirs,
    decodeSourceDirs,
    decodeOutputDir,
    syncLeftDir,
    syncLeftAlias,
    syncRightDir,
    syncRightAlias,
    duplicateScanDir,
    metaMismatchScanDir,
    pathFilterRules,
    fileListColumns,
    dataTableDisplay,
    appearance
  ],
  () => void persistFolderConfig(),
  { deep: true }
)
</script>

<template>
  <AudioCoverLightbox />
      <AudioFileContextMenuHost />
      <LyricsViewModalHost />
      <div class="app-shell" :style="dataTableCssStyle">
        <AppTopNav
          :active-view="activeView"
          @navigate="handleAppNavigate"
        />
        <div class="app-main">
        <SettingsPanel
          v-if="activeView === 'settings'"
          :advanced-unlocked="advancedUnlocked"
          v-model:path-filter-rules="pathFilterRules"
          v-model:search-roots="searchRoots"
          v-model:lrc-dirs="lrcDirs"
          v-model:decode-source-dirs="decodeSourceDirs"
          v-model:sync-left-dir="syncLeftDir"
          v-model:sync-left-alias="syncLeftAlias"
          v-model:sync-right-dir="syncRightDir"
          v-model:sync-right-alias="syncRightAlias"
          v-model:file-list-columns="fileListColumns"
          v-model:data-table-display="dataTableDisplay"
          :initial-tab="settingsInitialTab"
          class="settings-layer"
        />
        <KeepAlive v-show="activeView === 'sync'">
            <LibrarySyncPage
                v-if="activeView === 'sync'"
                key="library-sync"
                v-model:sync-left-dir="syncLeftDir"
                v-model:sync-left-alias="syncLeftAlias"
                v-model:sync-right-dir="syncRightDir"
                v-model:sync-right-alias="syncRightAlias"
                :path-filter-rules="pathFilterRules"
                class="settings-layer"
                @open-settings="openSyncSettings"
            />
        </KeepAlive>
        <LibraryDuplicatesPage
          v-if="activeView === 'duplicates'"
          v-model:duplicate-scan-dir="duplicateScanDir"
          :search-roots="searchRoots"
          :path-filter-rules="pathFilterRules"
          class="settings-layer"
        />
        <MetaTagMismatchPage
          v-if="activeView === 'metaMismatch'"
          v-model:meta-mismatch-scan-dir="metaMismatchScanDir"
          :search-roots="searchRoots"
          :sync-left-dir="syncLeftDir"
          :sync-left-alias="syncLeftAlias"
          :sync-right-dir="syncRightDir"
          :sync-right-alias="syncRightAlias"
          :path-filter-rules="pathFilterRules"
          class="settings-layer"
        />
        <SourceFilesPage
          v-if="activeView === 'library'"
          v-model:search-roots="searchRoots"
          :path-filter-rules="pathFilterRules"
          :file-list-columns="fileListColumns"
          class="settings-layer"
        />
        <MusicDecodePage
          v-if="activeView === 'decode' && advancedUnlocked"
          v-model:decode-source-dirs="decodeSourceDirs"
          v-model:decode-output-dir="decodeOutputDir"
          :search-roots="searchRoots"
          :path-filter-rules="pathFilterRules"
          :file-list-columns="fileListColumns"
          class="settings-layer"
        />
        <AboutPage
          v-if="activeView === 'about'"
          :advanced-unlocked="advancedUnlocked"
          class="settings-layer"
        />
        <div v-if="activeView === 'lrc'" class="workspace">
          <aside class="sidebar">
            <div class="sidebar-scroll">
              <section v-if="!canPreview" class="config-hint">
                <p class="config-hint-text">
                  请在「设置」中配置音频搜索目标与 LRC 源文件夹
                </p>
                <NButton
                 size="small" @click="handleAppNavigate('settings')">
                    <template #icon>
                      <NIcon><Folder /></NIcon>
                    </template>
                    打开设置
                </NButton>
              </section>

              <section class="toolbar">
                <NButton
                  block
                  size="large"
                  type="default"
                  :disabled="!canPreview || loading"
                  @click="preview"
                >
                  <template #icon>
                    <NIcon><Search /></NIcon>
                  </template>
                  预览匹配
                </NButton>
                <NButton
                  block
                  type="primary"
                  size="large"
                  :disabled="!canExecute || loading"
                  @click="executeCopy"
                >
                  <template #icon>
                    <NIcon><Play /></NIcon>
                  </template>
                  执行复制
                </NButton>

                <section
                  v-if="!result && !loading"
                  class="lrc-usage-guide"
                  aria-label="使用说明"
                >
                  <h3 class="lrc-usage-guide__title">用途</h3>
                  <p class="lrc-usage-guide__text">
                    将 LRC 源文件夹中的歌词匹配并复制到乐库音频所在目录（与音频同级同名），实现歌词「归位」。还可发现无对应音频的多余歌词，以及 macOS 编号重复的冗余音频。
                  </p>
                  <h3 class="lrc-usage-guide__title">使用说明</h3>
                  <ol class="lrc-usage-guide__list">
                    <li>在「设置 → 路径」中配置「音频搜索目标」（乐库目录）与「LRC 源文件夹」。</li>
                    <li>点击「预览匹配」扫描目标目录中的音频与 LRC 源的对应关系；大库扫描需一些时间，进度见左下角全局进度条。</li>
                    <li>扫描完成后，右侧列表按状态分类：已匹配、待复制、缺源、待选源等；「待选源」需在列表中为每首选择具体源歌词。</li>
                    <li>确认无误后点击「执行复制」，将歌词复制到音频同级目录（不删除 LRC 源文件）。</li>
                    <li>「多余」页可勾选并删除无对应音频的歌词或重复音频副本。</li>
                  </ol>
                </section>
              </section>

              <ScanAlertsPanel
                :result="result"
                :source-selection="sourceSelection"
                :selected-orphan-keys="selectedOrphanKeys"
                :selected-orphan-audio-keys="selectedOrphanAudioKeys"
                @deleted="preview"
              />
            </div>

            <AudioMetaPanel
              v-if="!batchTask.active"
              :file-path="metaPanelFilePath"
            />
          </aside>

          <section class="results-pane">
            <NSpin :show="loading" class="results-spin">
              <ResultsPanel
                v-if="showResults"
                v-model:source-selection="sourceSelection"
                v-model:selected-orphan-keys="selectedOrphanKeys"
                v-model:selected-orphan-audio-keys="selectedOrphanAudioKeys"
                v-model:meta-panel-file-path="metaPanelFilePath"
                :result="result!"
                :search-roots="searchRoots"
                :lrc-dirs="lrcDirs"
                fill-height
                @refresh="preview"
              />
              <div v-else-if="result?.empty" class="pane-placeholder">
                <p class="placeholder-title">未找到音频</p>
                <p class="placeholder-desc">请检查搜索目标文件夹是否正确</p>
              </div>
              <div v-else class="pane-placeholder">
                <p class="placeholder-title">尚未扫描</p>
                <p class="placeholder-desc">
                  请在左侧查看使用说明，配置文件夹后点击「预览匹配」
                </p>
              </div>
            </NSpin>
          </section>
        </div>
        </div>
      </div>
  <GlobalBatchProgressBar />
</template>

<style lang="scss" scoped>
@use './styles/variables' as *;

.app-shell {
  flex: 1;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: $color-bg;
}

.workspace {
  display: flex;
  flex: 1;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.sidebar {
  width: $sidebar-width;
  height: 100%;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border-right: 1px solid $border-sidebar;
  background: $surface-sidebar;
}

.sidebar-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.config-hint {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: $radius-panel;
  border: 1px dashed $border-subtle;
  background: $surface-panel;
}

.config-hint-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  opacity: 0.65;
}

.toolbar {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 4px;
}

.lrc-usage-guide {
  padding: 12px 14px;
  border-radius: $radius-panel;
  border: 1px solid $border-subtle;
  background: $surface-panel;
}

.lrc-usage-guide__title {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 600;
  opacity: 0.65;

  &:not(:first-child) {
    margin-top: 12px;
  }
}

.lrc-usage-guide__text {
  margin: 0;
  font-size: 11px;
  line-height: 1.55;
  opacity: 0.55;
}

.lrc-usage-guide__list {
  margin: 0;
  padding-left: 18px;
  font-size: 11px;
  line-height: 1.55;
  opacity: 0.55;

  li + li {
    margin-top: 6px;
  }
}

.app-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.settings-layer {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.results-pane {
  flex: 1;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

.results-spin {
  flex: 1;
  width: 100%;
  height: 100%;
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

.pane-placeholder {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--app-placeholder-bg);
}

.placeholder-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  opacity: 0.7;
}

.placeholder-desc {
  margin: 0;
  font-size: 13px;
  opacity: 0.45;
  text-align: center;
  max-width: 280px;
}
</style>
