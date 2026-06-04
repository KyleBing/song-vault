<script setup lang="ts">
import {
  NButton,
  NConfigProvider,
  NIcon,
  NMessageProvider,
  NSpin,
  darkTheme,
  dateZhCN,
  zhCN,
  type GlobalThemeOverrides
} from 'naive-ui'
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
import styleTokens from './styles/variables.module.scss'

const layoutStore = useLayoutStore()
const themeStore = useThemeStore()
const advancedUnlock = useAdvancedUnlockStore()
const audioPlayerStore = useAudioPlayerStore()
const { appearance } = storeToRefs(themeStore)
const { unlocked: advancedUnlocked } = storeToRefs(advancedUnlock)

const naiveTheme = computed(() =>
  appearance.value === 'dark' ? darkTheme : null
)

type AppView = AppNavigateTarget

const activeView = ref<AppView>('lrc')

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

const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#6ea8fe',
    primaryColorHover: '#8bb9ff',
    primaryColorPressed: '#5a94eb',
    borderRadius: styleTokens.borderRadius,
    fontFamily:
      "'Segoe UI', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif"
  },
  Card: {
    color: 'transparent'
  },
  Popover: {
    fontSize: '12px'
  },
  Tooltip: {
    peers: {
      Popover: {
        fontSize: '12px'
      }
    }
  }
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
  try {
    const jobResult = await window.electronAPI.runJob({
      lrcDirs: [...toRaw(lrcDirs.value)],
      searchRoots: [...toRaw(searchRoots.value)],
      execute,
      refreshScan: refreshScan || execute,
      sourceOverrides: { ...sourceSelection.value.sourceOverrides },
      preferredSourceDir: sourceSelection.value.preferredSourceDir,
      pathFilterRules: pathFilterRulesForSave(pathFilterRules.value)
    })
    result.value = jobResult
    if (!execute) {
      lastPreview.value = jobResult
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    window.alert(`运行失败: ${msg}`)
  } finally {
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
    activeView.value = 'lrc'
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
  <NConfigProvider
    :locale="zhCN"
    :date-locale="dateZhCN"
    :theme="naiveTheme"
    :theme-overrides="themeOverrides"
  >
    <NMessageProvider>
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
          :sync-left-dir="syncLeftDir"
          :sync-left-alias="syncLeftAlias"
          :sync-right-dir="syncRightDir"
          :sync-right-alias="syncRightAlias"
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
                  type="success"
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
              </section>

              <ScanAlertsPanel
                :result="result"
                :source-selection="sourceSelection"
                :selected-orphan-keys="selectedOrphanKeys"
                :selected-orphan-audio-keys="selectedOrphanAudioKeys"
                @deleted="preview"
              />
            </div>

            <AudioMetaPanel :file-path="metaPanelFilePath" />
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
                <p class="placeholder-title">扫描结果</p>
                <p class="placeholder-desc">
                  在「设置」中配置文件夹后，点击「预览匹配」在此查看列表
                </p>
              </div>
            </NSpin>
          </section>
        </div>
        </div>
      </div>
    </NMessageProvider>
  </NConfigProvider>
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
