<script setup lang="ts">
import { NButton, NCard, NIcon, NRadio, NRadioGroup, NText, useMessage } from 'naive-ui'
import {
  ArrowBack,
  ColorPaletteOutline,
  FilterOutline,
  InformationCircleOutline,
  ListOutline
} from '@vicons/ionicons5'
import { storeToRefs } from 'pinia'
import { onMounted, ref } from 'vue'
import type { AppAppearance, PathFilterRule } from '@shared/appConfig'
import { APP_CONFIG_FILE_NAME } from '@shared/appConfig'
import { useThemeStore } from '@renderer/stores/theme'
import { useAudioMetaHoverSettingsStore } from '@renderer/stores/audioMetaHoverSettings'
import FolderPanel from './FolderPanel.vue'
import type { FileListColumnsSettings } from '@shared/appConfig'
import PathFilterRulesEditor from './PathFilterRulesEditor.vue'
import FileListColumnsEditor from './FileListColumnsEditor.vue'
import AudioMetaHoverSettingsEditor from './AudioMetaHoverSettingsEditor.vue'

const message = useMessage()
const configFilePath = ref('')

const pathFilterRules = defineModel<PathFilterRule[]>('pathFilterRules', {
  required: true
})

const searchRoots = defineModel<string[]>('searchRoots', {
  required: true
})

const lrcDirs = defineModel<string[]>('lrcDirs', {
  required: true
})

const decodeSourceDirs = defineModel<string[]>('decodeSourceDirs', {
  required: true
})

const fileListColumns = defineModel<FileListColumnsSettings>('fileListColumns', {
  required: true
})

const emit = defineEmits<{
  close: []
}>()

const themeStore = useThemeStore()
const { appearance } = storeToRefs(themeStore)
const audioMetaHoverStore = useAudioMetaHoverSettingsStore()
const { settings: audioMetaHover } = storeToRefs(audioMetaHoverStore)

const appearanceOptions: { value: AppAppearance; label: string; desc: string }[] =
  [
    { value: 'light', label: '浅色', desc: '浅色背景，适合明亮环境' },
    { value: 'dark', label: '深色', desc: '深色背景，适合弱光环境' }
  ]

/** 设置页切换主题时委托给 theme store */
function onAppearanceChange(value: AppAppearance): void {
  themeStore.setAppearance(value)
}

onMounted(async () => {
  try {
    const { filePath } = await window.electronAPI.loadAppConfig()
    configFilePath.value = filePath
  } catch {
    /* 仅影响页脚展示 */
  }
})

/** 在资源管理器中打开配置文件所在目录并选中该文件 */
async function revealConfigFile(): Promise<void> {
  try {
    const { filePath } = await window.electronAPI.revealAppConfigInFolder()
    configFilePath.value = filePath
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    message.error(msg)
  }
}
</script>

<template>
  <div class="settings-page">
    <header class="page-header">
      <NButton quaternary circle @click="emit('close')">
        <template #icon>
          <NIcon :size="20"><ArrowBack /></NIcon>
        </template>
      </NButton>
      <div class="header-text">
        <h1>设置</h1>
      </div>
    </header>

    <div class="settings-body">
      <div class="settings-layout">
        <aside class="settings-aside">
          <NCard class="settings-card" :bordered="false" size="small">
            <template #header>
              <div class="card-header">
                <NIcon :size="18" class="card-header-icon">
                  <ColorPaletteOutline />
                </NIcon>
                <span>界面主题</span>
              </div>
            </template>

            <NRadioGroup
              :value="appearance"
              class="appearance-group"
              @update:value="onAppearanceChange"
            >
              <label
                v-for="opt in appearanceOptions"
                :key="opt.value"
                class="appearance-option"
                :class="{ 'appearance-option--active': appearance === opt.value }"
              >
                <NRadio :value="opt.value" />
                <div class="appearance-option-text">
                  <span class="appearance-option-label">{{ opt.label }}</span>
                  <NText depth="3" class="appearance-option-desc">{{ opt.desc }}</NText>
                </div>
                <span
                  class="appearance-swatch"
                  :class="`appearance-swatch--${opt.value}`"
                  aria-hidden="true"
                />
              </label>
            </NRadioGroup>
          </NCard>

          <NCard class="settings-card" :bordered="false" size="small">
            <template #header>
              <div class="card-header">
                <NIcon :size="18" class="card-header-icon">
                  <InformationCircleOutline />
                </NIcon>
                <span>悬停信息</span>
              </div>
            </template>

            <AudioMetaHoverSettingsEditor v-model:settings="audioMetaHover" />
          </NCard>

          <NCard class="settings-card" :bordered="false" size="small">
            <template #header>
              <div class="card-header">
                <NIcon :size="18" class="card-header-icon">
                  <ListOutline />
                </NIcon>
                <span>文件列表列</span>
              </div>
            </template>

            <FileListColumnsEditor
              v-model="fileListColumns"
              kind="source"
              title="音频搜索目标 · 文件列表"
            />
            <FileListColumnsEditor
              v-model="fileListColumns"
              kind="decode"
              title="音乐解码 · 文件列表"
              class="columns-editor-second"
            />
          </NCard>
        </aside>

        <main class="settings-main">
          <FolderPanel
            v-model="searchRoots"
            class="settings-folder-panel"
            title="音频搜索目标"
            hint="递归子目录，跳过 LRC 源"
            empty-text="添加搜索目标"
          />

          <FolderPanel
            v-model="lrcDirs"
            class="settings-folder-panel"
            title="LRC 源文件夹"
            hint="递归扫描 .lrc"
            empty-text="添加 LRC 源"
          />

          <FolderPanel
            v-model="decodeSourceDirs"
            class="settings-folder-panel"
            title="音乐解码浏览目录"
            hint="添加 QQ 音乐、网易云下载目录；详细说明见音乐解码页「下载与解密说明」"
            empty-text="添加用于浏览加密音乐的文件夹"
          />

          <NCard class="settings-card" :bordered="false" size="small">
            <template #header>
              <div class="card-header">
                <NIcon :size="18" class="card-header-icon">
                  <FilterOutline />
                </NIcon>
                <span>名称过滤</span>
              </div>
            </template>

            <PathFilterRulesEditor v-model:rules="pathFilterRules" />
          </NCard>
        </main>
      </div>

      <footer class="settings-footer">
        <NText depth="3" class="config-file-line">
          配置文件
          <button
            type="button"
            class="config-file-link"
            :title="configFilePath || undefined"
            @click="revealConfigFile"
          >
            {{ APP_CONFIG_FILE_NAME }}
          </button>
          <span class="config-file-sep">·</span>
          点击在资源管理器中打开并选中；修改后请重启应用以加载
        </NText>
      </footer>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '../styles/variables' as *;

$settings-inline-pad: 16px;
$settings-aside-width: clamp(300px, 35vw, 500px);

.settings-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background:
    radial-gradient(ellipse 70% 45% at 12% -8%, $glow-primary, transparent),
    radial-gradient(ellipse 50% 40% at 95% 100%, $glow-accent, transparent),
    $color-bg;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px $settings-inline-pad;
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
}

.settings-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  width: 100%;
  padding: 20px $settings-inline-pad 28px;
  box-sizing: border-box;
}

.settings-layout {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  min-height: min(100%, 480px);
}

.settings-aside,
.settings-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

@media (min-width: 880px) {
  .settings-layout {
    flex-direction: row;
    align-items: stretch;
    gap: 20px;
  }

  .settings-aside {
    flex: 0 0 $settings-aside-width;
    width: $settings-aside-width;
  }

  .settings-main {
    flex: 1;
    min-width: 0;
    padding-left: 20px;
    border-left: 1px solid $border-subtle;
  }
}

.settings-card,
.settings-folder-panel {
  background: $surface-panel;
  border: 1px solid $border-subtle;
  border-radius: $radius-panel;
}

.settings-card {
  :deep(.n-card-header) {
    padding-bottom: 4px;
  }

  :deep(.n-card__content) {
    padding-top: 4px;
  }
}

.settings-folder-panel {
  flex: none;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 15px;
}

.card-header-icon {
  opacity: 0.85;
}

.appearance-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.appearance-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: $radius-icon;
  border: 1px solid $border-subtle;
  background: var(--app-surface-raised);
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease;

  &:hover {
    border-color: var(--app-border-hover);
  }

  &--active {
    border-color: $color-primary;
    background: var(--app-surface-active);
  }
}

.appearance-option-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.appearance-option-label {
  font-size: 14px;
  font-weight: 600;
}

.appearance-option-desc {
  font-size: 12px;
}

.appearance-swatch {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  flex-shrink: 0;
  border: 1px solid $border-subtle;

  &--dark {
    background: linear-gradient(135deg, #1a1d26 50%, #0f1117 50%);
  }

  &--light {
    background: linear-gradient(135deg, #ffffff 50%, #e8eaed 50%);
  }
}

.columns-editor-second {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid $border-subtle;
}

.settings-footer {
  margin-top: 20px;
  padding-top: 12px;
  border-top: 1px solid $border-subtle;
}

.config-file-line {
  font-size: 11px;
  line-height: 1.5;
  opacity: 0.65;
}

.config-file-link {
  margin: 0 4px;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  font-size: inherit;
  color: $color-primary;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;

  &:hover {
    opacity: 0.85;
  }
}

.config-file-sep {
  margin: 0 4px;
  opacity: 0.5;
}
</style>
