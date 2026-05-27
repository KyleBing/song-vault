<script setup lang="ts">
import {
  NButton,
  NConfigProvider,
  NIcon,
  NMessageProvider,
  NSpin,
  darkTheme,
  type GlobalThemeOverrides
} from 'naive-ui'
import {
  FolderOpen,
  Key,
  MusicalNotes,
  Play,
  Search,
  SettingsOutline
} from '@vicons/ionicons5'
import { computed, onMounted, onUnmounted, ref, toRaw, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useLayoutStore } from '@renderer/stores/layout'
import {
  loadAppConfigOnce,
  saveAppConfig
} from '@renderer/lib/appConfigClient'
import { useThemeStore } from '@renderer/stores/theme'
import { useAudioMetaHoverSettingsStore } from '@renderer/stores/audioMetaHoverSettings'
import SettingsPanel from './components/SettingsPanel.vue'
import MusicDecodePage from './components/MusicDecodePage.vue'
import SourceFilesPage from './components/SourceFilesPage.vue'
import {
  APP_CONFIG_VERSION,
  createDefaultAppConfig,
  type AppConfig,
  type FileListColumnsSettings,
  type PathFilterRule
} from '@shared/appConfig'
import { normalizeFileListColumns } from '@shared/fileListColumns'
import { pathFilterRulesForSave } from '@shared/pathFilters'
import type { JobResult } from '@shared/lrcJob'
import {
  countReadyToCopy,
  type SourceSelection
} from '@shared/sourcePick'
import ResultsPanel from './components/ResultsPanel.vue'
import ScanAlertsPanel from './components/ScanAlertsPanel.vue'
import styleTokens from './styles/variables.module.scss'

const layoutStore = useLayoutStore()
const themeStore = useThemeStore()
const audioMetaHoverStore = useAudioMetaHoverSettingsStore()
const { appearance } = storeToRefs(themeStore)
const { settings: audioMetaHoverSettings } = storeToRefs(audioMetaHoverStore)

const naiveTheme = computed(() =>
  appearance.value === 'dark' ? darkTheme : null
)

const showSettings = ref(false)
const showMusicDecode = ref(false)
const showSourceFiles = ref(false)

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
  }
}

const lrcDirs = ref<string[]>([])
const searchRoots = ref<string[]>([])
const decodeSourceDirs = ref<string[]>([])
const decodeOutputDir = ref('')
const pathFilterRules = ref<PathFilterRule[]>([])
const fileListColumns = ref<FileListColumnsSettings>(
  createDefaultAppConfig().fileListColumns
)
/** 已完成启动配置加载，避免恢复时触发多余写入 */
const configHydrated = ref(false)
const loading = ref(false)
const result = ref<JobResult | null>(null)
const lastPreview = ref<JobResult | null>(null)
const sourceSelection = ref<SourceSelection>({ sourceOverrides: {} })
const selectedOrphanKeys = ref<string[]>([])

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
async function run(execute: boolean): Promise<void> {
  if (!canPreview.value) return
  loading.value = true
  try {
    const jobResult = await window.electronAPI.runJob({
      lrcDirs: [...toRaw(lrcDirs.value)],
      searchRoots: [...toRaw(searchRoots.value)],
      execute,
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

/** 重置源歌词选择并运行预览扫描 */
function preview(): void {
  sourceSelection.value = { sourceOverrides: {} }
  selectedOrphanKeys.value = []
  void run(false)
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
    appearance: appearance.value,
    pathFilterRules: pathFilterRulesForSave(toRaw(pathFilterRules.value)),
    fileListColumns: {
      source: [...columns.source],
      decode: [...columns.decode]
    },
    audioMetaHover: { ...toRaw(audioMetaHoverSettings.value) }
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

onMounted(async () => {
  layoutStore.updateInsets()
  window.addEventListener('resize', onWindowResize)

  try {
    const config = await loadAppConfigOnce()
    searchRoots.value = [...config.searchRoots]
    lrcDirs.value = [...config.lrcDirs]
    decodeSourceDirs.value = [...config.decodeSourceDirs]
    decodeOutputDir.value = config.decodeOutputDir
    pathFilterRules.value = [...config.pathFilterRules]
    fileListColumns.value = normalizeFileListColumns(config.fileListColumns)
    audioMetaHoverStore.apply(config.audioMetaHover)
  } catch (err) {
    console.error('加载目录配置失败', err)
  } finally {
    configHydrated.value = true
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', onWindowResize)
})

watch(
  [
    searchRoots,
    lrcDirs,
    decodeSourceDirs,
    decodeOutputDir,
    pathFilterRules,
    fileListColumns,
    appearance,
    audioMetaHoverSettings
  ],
  () => void persistFolderConfig(),
  { deep: true }
)
</script>

<template>
  <NConfigProvider
    :theme="naiveTheme"
    :theme-overrides="themeOverrides"
  >
    <NMessageProvider>
      <div class="app-shell">
        <SettingsPanel
          v-if="showSettings"
          v-model:path-filter-rules="pathFilterRules"
          v-model:search-roots="searchRoots"
          v-model:lrc-dirs="lrcDirs"
          v-model:decode-source-dirs="decodeSourceDirs"
          v-model:file-list-columns="fileListColumns"
          class="settings-layer"
          @close="showSettings = false"
        />
        <SourceFilesPage
          v-else-if="showSourceFiles"
          v-model:search-roots="searchRoots"
          :path-filter-rules="pathFilterRules"
          :file-list-columns="fileListColumns"
          class="settings-layer"
          @close="showSourceFiles = false"
        />
        <MusicDecodePage
          v-else-if="showMusicDecode"
          v-model:decode-source-dirs="decodeSourceDirs"
          v-model:decode-output-dir="decodeOutputDir"
          :search-roots="searchRoots"
          :path-filter-rules="pathFilterRules"
          :file-list-columns="fileListColumns"
          class="settings-layer"
          @close="showMusicDecode = false"
        />
        <div v-else class="workspace">
          <aside class="sidebar">
            <div class="brand">
              <div class="brand-icon">
                <NIcon :size="22"><MusicalNotes /></NIcon>
              </div>
              <div class="brand-text">
                <h1>LRC 歌词归位</h1>
                <p>匹配并复制歌词到音频旁</p>
              </div>
            </div>

            <div class="sidebar-scroll">
              <section v-if="!canPreview" class="config-hint">
                <p class="config-hint-text">
                  请在「设置」中配置音频搜索目标与 LRC 源文件夹
                </p>
                <NButton size="small" @click="showSettings = true">
                  打开设置
                </NButton>
              </section>

              <section class="toolbar">
                <NButton
                  block
                  size="medium"
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
                  size="medium"
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
                @deleted="preview"
              />
            </div>

            <div class="sidebar-foot">
              <NButton
                quaternary
                block
                size="small"
                class="settings-btn"
                @click="showSourceFiles = true"
              >
                <template #icon>
                  <NIcon><FolderOpen /></NIcon>
                </template>
                文件管理
              </NButton>
              <NButton
                quaternary
                block
                size="small"
                class="settings-btn"
                @click="showMusicDecode = true"
              >
                <template #icon>
                  <NIcon><Key /></NIcon>
                </template>
                音乐解码
              </NButton>
              <NButton
                quaternary
                block
                size="small"
                class="settings-btn"
                @click="showSettings = true"
              >
                <template #icon>
                  <NIcon><SettingsOutline /></NIcon>
                </template>
                设置
              </NButton>
              <p class="sidebar-foot-note">
                以音频为主 · 同级同名即已匹配
              </p>
            </div>
          </aside>

          <section class="results-pane">
            <NSpin :show="loading" class="results-spin">
              <ResultsPanel
                v-if="showResults"
                v-model:source-selection="sourceSelection"
                v-model:selected-orphan-keys="selectedOrphanKeys"
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
  background:
    radial-gradient(ellipse 70% 45% at 12% -8%, $glow-primary, transparent),
    radial-gradient(ellipse 50% 40% at 95% 100%, $glow-accent, transparent),
    $color-bg;
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

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 20px 16px;
  flex-shrink: 0;
}

.brand-icon {
  width: 40px;
  height: 40px;
  border-radius: $radius-icon;
  background: linear-gradient(135deg, $color-primary 0%, $color-accent 100%);
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

.settings-layer {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.sidebar-foot {
  flex-shrink: 0;
  padding: 8px 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settings-btn {
  justify-content: flex-start;
}

.sidebar-foot-note {
  margin: 0;
  padding: 0 8px;
  font-size: 11px;
  opacity: 0.38;
  line-height: 1.4;
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
