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
import { MusicalNotes, Play, Search } from '@vicons/ionicons5'
import { computed, onMounted, ref, toRaw, watch } from 'vue'
import { APP_CONFIG_VERSION, type AppConfig } from '@shared/appConfig'
import type { JobResult } from '@shared/lrcJob'
import {
  countReadyToCopy,
  type SourceSelection
} from '@shared/sourcePick'
import FolderPanel from './components/FolderPanel.vue'
import ResultsPanel from './components/ResultsPanel.vue'
import ScanAlertsPanel from './components/ScanAlertsPanel.vue'

const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#6ea8fe',
    primaryColorHover: '#8bb9ff',
    primaryColorPressed: '#5a94eb',
    borderRadius: '10px',
    fontFamily:
      "'Segoe UI', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif"
  },
  Card: {
    color: 'transparent'
  }
}

const lrcDirs = ref<string[]>([])
const searchRoots = ref<string[]>([])
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

async function run(execute: boolean): Promise<void> {
  if (!canPreview.value) return
  loading.value = true
  try {
    const jobResult = await window.electronAPI.runJob({
      lrcDirs: [...toRaw(lrcDirs.value)],
      searchRoots: [...toRaw(searchRoots.value)],
      execute,
      sourceOverrides: { ...sourceSelection.value.sourceOverrides },
      preferredSourceDir: sourceSelection.value.preferredSourceDir
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

function preview(): void {
  sourceSelection.value = { sourceOverrides: {} }
  selectedOrphanKeys.value = []
  void run(false)
}

function executeCopy(): void {
  void run(true)
}

function buildAppConfig(): AppConfig {
  return {
    version: APP_CONFIG_VERSION,
    searchRoots: [...searchRoots.value],
    lrcDirs: [...lrcDirs.value]
  }
}

async function persistFolderConfig(): Promise<void> {
  if (!configHydrated.value) return
  try {
    await window.electronAPI.saveAppConfig(buildAppConfig())
  } catch (err) {
    console.error('保存目录配置失败', err)
  }
}

onMounted(async () => {
  try {
    const { config } = await window.electronAPI.loadAppConfig()
    searchRoots.value = [...config.searchRoots]
    lrcDirs.value = [...config.lrcDirs]
  } catch (err) {
    console.error('加载目录配置失败', err)
  } finally {
    configHydrated.value = true
  }
})

watch([searchRoots, lrcDirs], () => void persistFolderConfig(), { deep: true })
</script>

<template>
  <NConfigProvider
    class="app-root"
    :theme="darkTheme"
    :theme-overrides="themeOverrides"
  >
    <NMessageProvider class="app-root">
      <div class="app-shell">
        <div class="workspace">
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
              <FolderPanel
                v-model="searchRoots"
                title="音频搜索目标"
                hint="递归子目录，跳过 LRC 源"
                empty-text="添加搜索目标"
              />
              <FolderPanel
                v-model="lrcDirs"
                title="LRC 源文件夹"
                hint="递归扫描 .lrc"
                empty-text="添加 LRC 源"
              />

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

            <p class="sidebar-foot">
              以音频为主 · 同级同名即已匹配
            </p>
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
                  在左侧添加文件夹后，点击「预览匹配」在此查看列表
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

.app-root {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;

  :deep(.n-message-provider) {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
}

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

  :deep(.folder-panel) {
    flex: none;
  }
}

.toolbar {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 4px;
}

.sidebar-foot {
  flex-shrink: 0;
  margin: 0;
  padding: 12px 20px 16px;
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
  border: 1px dashed rgba(255, 255, 255, 0.1);
  border-radius: $radius-panel;
  background: rgba(255, 255, 255, 0.02);
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
