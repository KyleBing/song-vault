<script setup lang="ts">
import {
  NButton,
  NIcon,
  NSpin
} from 'naive-ui'
import { ArrowBack, Key, Search } from '@vicons/ionicons5'
import { computed, ref, toRaw } from 'vue'
import MusicDecodeResultsPanel from './MusicDecodeResultsPanel.vue'
import type { PathFilterRule } from '@shared/appConfig'
import type { MusicScanResult } from '@shared/musicScanJob'
import { pathFilterRulesForSave } from '@shared/pathFilters'

const decodeSourceDirs = defineModel<string[]>('decodeSourceDirs', {
  required: true
})

const props = defineProps<{
  pathFilterRules: PathFilterRule[]
}>()

const emit = defineEmits<{
  close: []
}>()

const loading = ref(false)
const result = ref<MusicScanResult | null>(null)

const canScan = computed(() => decodeSourceDirs.value.length > 0)

const showResults = computed(
  () => result.value !== null && !result.value.empty
)

/** 扫描待解码源目录中的加密音频与明文 MP3 */
async function scan(): Promise<void> {
  if (!canScan.value) return
  loading.value = true
  try {
    result.value = await window.electronAPI.scanMusicDecode({
      decodeSourceDirs: [...toRaw(decodeSourceDirs.value)],
      pathFilterRules: pathFilterRulesForSave(props.pathFilterRules)
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    window.alert(`扫描失败: ${msg}`)
  } finally {
    loading.value = false
  }
}
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
              <p>扫描网易云 / QQ 加密文件</p>
            </div>
          </div>
        </header>

        <div class="sidebar-scroll">
          <p v-if="!decodeSourceDirs.length" class="decode-hint">
            请先在「设置」中添加加密音乐源目录
          </p>

          <section class="toolbar">
            <NButton
              block
              type="primary"
              size="medium"
              :disabled="!canScan || loading"
              @click="scan"
            >
              <template #icon>
                <NIcon><Search /></NIcon>
              </template>
              扫描文件
            </NButton>
          </section>
        </div>

        <p class="sidebar-foot-note">
          扩展名规则参考 unlock-music · 同级同名 .lrc 即视为已有歌词
        </p>
      </aside>

      <section class="results-pane">
        <NSpin :show="loading" class="results-spin">
          <MusicDecodeResultsPanel
            v-if="showResults"
            :result="result!"
            :decode-source-dirs="decodeSourceDirs"
          />
          <div v-else-if="result?.empty" class="pane-placeholder">
            <p class="placeholder-title">未找到音频</p>
            <p class="placeholder-desc">
              请检查源目录是否包含加密音乐或 MP3 文件
            </p>
          </div>
          <div v-else class="pane-placeholder">
            <p class="placeholder-title">扫描结果</p>
            <p class="placeholder-desc">
              在设置中配置加密音乐源目录后，点击「扫描文件」查看列表
            </p>
          </div>
        </NSpin>
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
  gap: 12px;
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

.toolbar {
  padding-top: 4px;
}

.sidebar-foot-note {
  flex-shrink: 0;
  margin: 0;
  padding: 8px 20px 16px;
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
  margin: 16px 20px;
  border: 1px dashed var(--app-placeholder-border);
  border-radius: $radius-panel;
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
