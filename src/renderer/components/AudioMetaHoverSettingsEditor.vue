<script setup lang="ts">
import {
  NInputNumber,
  NRadio,
  NRadioGroup,
  NSwitch,
  NText
} from 'naive-ui'
import type { AudioMetaHoverSettings } from '@shared/audioMetaHoverSettings'
import AudioMetaPopperContent from './AudioMetaPopperContent.vue'
import {
  AUDIO_META_HOVER_PREVIEW_PATH,
  createAudioMetaHoverPreviewMeta
} from '@renderer/utils/audioMetaHoverPreviewSample'

const settings = defineModel<AudioMetaHoverSettings>('settings', {
  required: true
})

const previewMeta = createAudioMetaHoverPreviewMeta()

const displayModeOptions = [
  {
    value: 'minimal' as const,
    label: '极简',
    desc: '仅封面、曲名、专辑、作者'
  },
  {
    value: 'normal' as const,
    label: '常规',
    desc: '常用标签与格式信息，中文标签'
  },
  {
    value: 'full' as const,
    label: '完整',
    desc: '全部标签、格式与原生字段'
  }
]
</script>

<template>
  <div class="hover-settings">
    <div class="hover-settings-layout">
      <div class="hover-settings-controls">
        <div class="hover-settings-row">
          <div class="hover-settings-label">
            <span>启用悬停信息</span>
            <NText depth="3" class="hover-settings-hint">
              关闭后音频文件仅显示路径提示
            </NText>
          </div>
          <NSwitch v-model:value="settings.enabled" />
        </div>

        <div class="hover-settings-row hover-settings-row--field">
          <div class="hover-settings-label">
            <span>触发延迟</span>
            <NText depth="3" class="hover-settings-hint">鼠标悬停后弹出（毫秒）</NText>
          </div>
          <NInputNumber
            v-model:value="settings.showDelayMs"
            :min="0"
            :max="3000"
            :step="50"
            :disabled="!settings.enabled"
            size="small"
            class="hover-settings-delay"
          />
        </div>

        <NRadioGroup
          v-model:value="settings.displayMode"
          class="hover-settings-modes"
          :disabled="!settings.enabled"
        >
          <label
            v-for="opt in displayModeOptions"
            :key="opt.value"
            class="hover-settings-mode"
            :class="{
              'hover-settings-mode--active': settings.displayMode === opt.value
            }"
          >
            <NRadio :value="opt.value" />
            <div class="hover-settings-mode-text">
              <span class="hover-settings-mode-label">{{ opt.label }}</span>
              <NText depth="3" class="hover-settings-mode-desc">{{ opt.desc }}</NText>
            </div>
          </label>
        </NRadioGroup>
      </div>

      <aside class="hover-settings-preview">
        <div class="hover-settings-preview-head">
          <span class="hover-settings-preview-title">效果预览</span>
          <NText depth="3" class="hover-settings-preview-hint">
            切换左侧选项可即时查看
          </NText>
        </div>

        <div v-if="!settings.enabled" class="hover-settings-preview-off">
          <NText depth="3">悬停信息已关闭，列表中将仅显示路径提示</NText>
        </div>
        <div v-else class="hover-settings-preview-panel">
          <AudioMetaPopperContent
            :meta="previewMeta"
            :file-path="AUDIO_META_HOVER_PREVIEW_PATH"
            :display-mode="settings.displayMode"
          />
        </div>
        <NText
          v-if="settings.enabled"
          depth="3"
          class="hover-settings-preview-delay"
        >
          触发延迟 {{ settings.showDelayMs }} ms（预览不模拟等待）
        </NText>
      </aside>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '../styles/variables' as *;

.hover-settings {
  width: 100%;
  min-width: 0;
}

.hover-settings-layout {
  display: flex;
  align-items: flex-start;
  gap: 24px;
  width: 100%;
  min-width: 0;
}

.hover-settings-controls {
  flex: 1 1 280px;
  min-width: 0;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.hover-settings-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.hover-settings-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 14px;
  font-weight: 600;
}

.hover-settings-hint {
  font-size: 12px;
  font-weight: 400;
}

.hover-settings-delay {
  width: 120px;
  flex-shrink: 0;
}

.hover-settings-modes {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.hover-settings-mode {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
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

.hover-settings-mode-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.hover-settings-mode-label {
  font-size: 13px;
  font-weight: 600;
}

.hover-settings-mode-desc {
  font-size: 12px;
  line-height: 1.4;
}

.hover-settings-preview {
  flex: 0 0 min(380px, 42%);
  min-width: 260px;
  padding-left: 24px;
  border-left: 1px solid $border-subtle;
  position: sticky;
  top: 0;
}

.hover-settings-preview-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 10px;
}

@media (max-width: 720px) {
  .hover-settings-layout {
    flex-direction: column;
    gap: 16px;
  }

  .hover-settings-controls {
    max-width: none;
    width: 100%;
  }

  .hover-settings-preview {
    flex: none;
    width: 100%;
    min-width: 0;
    padding-left: 0;
    padding-top: 16px;
    border-left: none;
    border-top: 1px solid $border-subtle;
    position: static;
  }
}

.hover-settings-preview-title {
  font-size: 13px;
  font-weight: 600;
}

.hover-settings-preview-hint {
  font-size: 12px;
}

.hover-settings-preview-off {
  padding: 16px 12px;
  border-radius: $radius-icon;
  border: 1px dashed $border-subtle;
  background: var(--app-surface-raised);
  text-align: center;
}

.hover-settings-preview-panel {
  display: block;
  width: 100%;
  max-width: 380px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid $border-subtle;
  background: var(--app-surface-raised);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.14);
  box-sizing: border-box;
}

.hover-settings-preview-delay {
  display: block;
  margin-top: 8px;
  font-size: 11px;
}
</style>
