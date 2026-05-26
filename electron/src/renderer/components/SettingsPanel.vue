<script setup lang="ts">
import { NButton, NCard, NIcon, NRadio, NRadioGroup, NText } from 'naive-ui'
import { ArrowBack, ColorPaletteOutline } from '@vicons/ionicons5'
import { storeToRefs } from 'pinia'
import type { AppAppearance } from '@shared/appConfig'
import { useThemeStore } from '@renderer/stores/theme'

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

function onAppearanceChange(value: AppAppearance): void {
  themeStore.setAppearance(value)
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
  max-width: 520px;
}

.settings-card {
  background: $surface-panel;
  border: 1px solid $border-subtle;
  border-radius: $radius-panel;
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
</style>
