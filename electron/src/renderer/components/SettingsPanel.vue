<script setup lang="ts">
import { NButton, NCard, NIcon, NRadio, NRadioGroup, NText, useMessage } from 'naive-ui'
import { ArrowBack, ColorPaletteOutline, FilterOutline } from '@vicons/ionicons5'
import { storeToRefs } from 'pinia'
import { onMounted, ref } from 'vue'
import type { AppAppearance, PathFilterRule } from '@shared/appConfig'
import { APP_CONFIG_FILE_NAME } from '@shared/appConfig'
import { useThemeStore } from '@renderer/stores/theme'
import FolderPanel from './FolderPanel.vue'
import PathFilterRulesEditor from './PathFilterRulesEditor.vue'

const message = useMessage()
const configFilePath = ref('')

const pathFilterRules = defineModel<PathFilterRule[]>('pathFilterRules', {
  required: true
})

const decodeSourceDirs = defineModel<string[]>('decodeSourceDirs', {
  required: true
})

const emit = defineEmits<{
  close: []
}>()

const themeStore = useThemeStore()
const { appearance } = storeToRefs(themeStore)

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
    <header class="settings-header">
      <NButton quaternary circle @click="emit('close')">
        <template #icon>
          <NIcon :size="20"><ArrowBack /></NIcon>
        </template>
      </NButton>
      <h2 class="settings-title">设置</h2>
    </header>

    <div class="settings-body">
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

      <FolderPanel
        v-model="decodeSourceDirs"
        class="settings-folder-panel"
        title="加密音乐源目录"
        hint="存放 .ncm、.qmc*、.mflac 等待解码文件，供音乐解码使用"
        empty-text="添加加密音乐所在文件夹"
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

.settings-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: $color-bg;
}

.settings-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 20px 12px;
  flex-shrink: 0;
  border-bottom: 1px solid $border-sidebar;
}

.settings-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.settings-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px;
  max-width: 640px;
}

.settings-card,
.settings-folder-panel {
  background: $surface-panel;
  border: 1px solid $border-subtle;
  border-radius: $radius-panel;
}

.settings-card + .settings-card,
.settings-card + .settings-folder-panel,
.settings-folder-panel + .settings-card,
.settings-folder-panel + .settings-folder-panel {
  margin-top: 16px;
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
