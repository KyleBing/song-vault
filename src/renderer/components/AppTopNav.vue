<script setup lang="ts">
import type { AppNavigateTarget } from '@shared/appNavigate'

defineProps<{
  activeView: AppNavigateTarget
}>()

const emit = defineEmits<{
  navigate: [view: AppNavigateTarget]
}>()

const navItems: { id: AppNavigateTarget; label: string }[] = [
  { id: 'lrc', label: 'LRC 歌词归位' },
  { id: 'decode', label: '音乐解码' },
  { id: 'library', label: '音频库' },
  { id: 'help', label: '解密说明' },
  { id: 'settings', label: '设置' },
  { id: 'about', label: '关于' }
]
</script>

<template>
  <nav class="app-top-nav" aria-label="主导航">
    <button
      v-for="item in navItems"
      :key="item.id"
      type="button"
      class="app-top-nav__item"
      :class="{ 'app-top-nav__item--active': activeView === item.id }"
      @click="emit('navigate', item.id)"
    >
      {{ item.label }}
    </button>
  </nav>
</template>

<style lang="scss" scoped>
@use '../styles/variables' as *;

.app-top-nav {
  flex-shrink: 0;
  display: flex;
  align-items: stretch;
  flex-wrap: wrap;
  gap: 2px;
  padding: 0 12px;
  min-height: 40px;
  border-bottom: 1px solid $border-subtle;
  background: $surface-panel;
}

.app-top-nav__item {
  margin: 0;
  padding: 0 14px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  opacity: 0.72;
  white-space: nowrap;
  transition:
    opacity 0.15s,
    background 0.15s,
    border-color 0.15s;

  &:hover {
    opacity: 1;
    background: $surface-active;
  }

  &--active {
    opacity: 1;
    font-weight: 600;
    border-bottom-color: $color-primary;
    background: $surface-active;
  }
}
</style>
