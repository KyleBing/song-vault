<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import type { AppNavigateTarget } from '@shared/appNavigate'
import { APP_VERSION } from '@shared/appInfo'
import { useAdvancedUnlockStore } from '@renderer/stores/advancedUnlock'

defineProps<{
  activeView: AppNavigateTarget
}>()

const emit = defineEmits<{
  navigate: [view: AppNavigateTarget]
}>()

const advancedUnlock = useAdvancedUnlockStore()
const { unlocked: advancedUnlocked } = storeToRefs(advancedUnlock)

const navItems = computed(() => {
  const items: { id: AppNavigateTarget; label: string }[] = [
    { id: 'lrc', label: 'LRC 歌词归位' },
    { id: 'library', label: '乐库管理' },
    { id: 'sync', label: '乐库同步' },
    { id: 'duplicates', label: '重复清理' },
    { id: 'settings', label: '设置' },
    { id: 'about', label: '关于' }
  ]
  if (advancedUnlocked.value) {
    items.splice(1, 0, { id: 'decode', label: '音乐解码' })
  }
  return items
})
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
      <template v-if="item.id === 'about'">
        关于
        <span class="app-top-nav__version">v{{ APP_VERSION }}</span>
      </template>
      <template v-else>{{ item.label }}</template>
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

.app-top-nav__version {
  margin-left: 5px;
  font-size: 11px;
  font-weight: 400;
  opacity: 0.5;
  letter-spacing: 0.02em;

  .app-top-nav__item--active & {
    opacity: 0.65;
  }

  .app-top-nav__item:hover & {
    opacity: 0.6;
  }
}
</style>
