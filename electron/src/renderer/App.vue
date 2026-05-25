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
import { computed, ref, toRaw } from 'vue'
import type { JobResult } from '@shared/lrcJob'
import {
  countReadyToCopy,
  type SourceSelection
} from '@shared/sourcePick'
import FolderPanel from './components/FolderPanel.vue'
import ResultsPanel from './components/ResultsPanel.vue'

/** Naive UI 深色主题覆盖（主色、圆角等） */
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

/** 用户选择的 LRC 源文件夹路径列表 */
const lrcDirs = ref<string[]>([])
/** 用户选择的音频搜索根目录列表 */
const searchRoots = ref<string[]>([])
/** 是否正在调用主进程执行任务 */
const loading = ref(false)
/** 最近一次任务结果（预览或执行） */
const result = ref<JobResult | null>(null)
/** 最近一次预览结果，用于判断能否执行复制 */
const lastPreview = ref<JobResult | null>(null)
/** 用户对多个源歌词的选择（预览后、复制前） */
const sourceSelection = ref<SourceSelection>({ sourceOverrides: {} })

/** 是否已具备预览条件（两类目录均至少一个） */
const canPreview = computed(
  () => lrcDirs.value.length > 0 && searchRoots.value.length > 0
)

/** 是否允许执行复制（预览过且存在待复制项） */
const canExecute = computed(() => {
  if (!lastPreview.value || lastPreview.value.empty) return false
  return (
    countReadyToCopy(lastPreview.value.audioItems, sourceSelection.value) > 0
  )
})

/** 调用主进程运行任务；execute 为 false 时仅预览 */
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

/** 预览匹配，不写文件 */
function preview(): void {
  sourceSelection.value = { sourceOverrides: {} }
  void run(false)
}

/** 按预览结果执行复制 */
function executeCopy(): void {
  void run(true)
}
</script>

<template>
  <NConfigProvider :theme="darkTheme" :theme-overrides="themeOverrides">
    <NMessageProvider>
      <div class="app-shell">
        <header class="app-header">
          <div class="brand">
            <div class="brand-icon">
              <NIcon :size="26"><MusicalNotes /></NIcon>
            </div>
            <div>
              <h1>LRC 歌词归位</h1>
              <p>以目标文件夹中的音频为主，匹配并复制 LRC 源歌词到同级目录</p>
            </div>
          </div>
        </header>

        <main class="app-main">
          <section class="folder-panels">
            <FolderPanel
              v-model="searchRoots"
              title="音频搜索目标"
              hint="递归搜索子目录，自动跳过 LRC 源目录"
              empty-text="请添加至少一个搜索目标文件夹"
            />
            <FolderPanel
              v-model="lrcDirs"
              title="LRC 源文件夹"
              hint="递归扫描子文件夹中的 .lrc，可添加多个"
              empty-text="请添加至少一个 LRC 源文件夹"
            />
          </section>

          <section class="toolbar">
            <NButton
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

          <NSpin :show="loading">
            <ResultsPanel
              v-if="result && !result.empty"
              v-model:source-selection="sourceSelection"
              :result="result"
              :search-roots="searchRoots"
              :lrc-dirs="lrcDirs"
              @refresh="preview"
              @execute-copy="executeCopy"
            />
            <div v-else-if="result?.empty" class="empty-result">
              搜索范围内未找到音频文件
            </div>
          </NSpin>
        </main>

        <footer class="app-footer">
          以音频为主列表 · 已匹配指同级同名歌词与音频并存 · 可删除无音频配对的多余歌词
        </footer>
      </div>
    </NMessageProvider>
  </NConfigProvider>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  background:
    radial-gradient(ellipse 80% 50% at 50% -20%, rgba(110, 168, 254, 0.18), transparent),
    #0f1117;
}

.app-header {
  padding: 24px 28px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.brand {
  display: flex;
  align-items: center;
  gap: 16px;
}

.brand-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: linear-gradient(135deg, #6ea8fe 0%, #9b7ede 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: 0 8px 24px rgba(110, 168, 254, 0.35);
}

.brand h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.brand p {
  margin: 4px 0 0;
  font-size: 13px;
  opacity: 0.6;
}

.app-main {
  flex: 1;
  overflow: auto;
  padding: 20px 28px 12px;
}

.folder-panels {
  display: flex;
  gap: 16px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
  flex-wrap: wrap;
}

.empty-result {
  margin-top: 24px;
  text-align: center;
  opacity: 0.5;
  font-size: 14px;
}

.app-footer {
  padding: 12px 28px 16px;
  font-size: 12px;
  opacity: 0.4;
  text-align: center;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}
</style>
