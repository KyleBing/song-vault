<script setup lang="ts">
import {
  NInputNumber,
  NRadio,
  NRadioGroup,
  NSwitch,
  NText
} from 'naive-ui'
import type { AudioMetaHoverSettings } from '@shared/audioMetaHoverSettings'

const settings = defineModel<AudioMetaHoverSettings>('settings', {
  required: true
})

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
</template>

<style lang="scss" scoped>
@use '../styles/variables' as *;

.hover-settings {
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
</style>
