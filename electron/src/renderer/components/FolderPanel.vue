<script setup lang="ts">
import {
  NButton,
  NCard,
  NEmpty,
  NIcon,
  NList,
  NListItem,
  NText,
  NTooltip
} from 'naive-ui'
import { Add, Close, FolderOpen } from '@vicons/ionicons5'

/** 父组件绑定的文件夹路径列表 */
const paths = defineModel<string[]>({ required: true })

defineProps<{
  /** 面板标题 */
  title: string
  /** 副标题说明 */
  hint: string
  /** 列表为空时的提示 */
  emptyText?: string
}>()

/** 通过系统对话框添加文件夹，自动去重 */
async function addFolder(): Promise<void> {
  const picked = await window.electronAPI.pickDirectory()
  if (!picked) return
  if (paths.value.includes(picked)) return
  paths.value = [...paths.value, picked]
}

/** 从列表中移除指定下标的路径 */
function removeAt(index: number): void {
  paths.value = paths.value.filter((_, i) => i !== index)
}
</script>

<template>
  <NCard class="folder-panel" :bordered="false" size="small">
    <template #header>
      <div class="panel-header">
        <span class="panel-title">{{ title }}</span>
        <NText depth="3" class="panel-hint">{{ hint }}</NText>
      </div>
    </template>
    <template #header-extra>
      <NButton secondary type="primary" size="small" @click="addFolder">
        <template #icon>
          <NIcon><Add /></NIcon>
        </template>
        添加文件夹
      </NButton>
    </template>

    <NList v-if="paths.length" class="path-list" bordered>
      <NListItem v-for="(p, index) in paths" :key="p">
        <div class="path-row">
          <NIcon class="path-icon" :size="18"><FolderOpen /></NIcon>
          <NTooltip trigger="hover" :style="{ maxWidth: '520px' }">
            <template #trigger>
              <span class="path-text">{{ p }}</span>
            </template>
            {{ p }}
          </NTooltip>
          <NButton
            quaternary
            circle
            size="tiny"
            class="remove-btn"
            @click="removeAt(index)"
          >
            <template #icon>
              <NIcon><Close /></NIcon>
            </template>
          </NButton>
        </div>
      </NListItem>
    </NList>
    <NEmpty
      v-else
      size="small"
      :description="emptyText ?? '点击右上角添加文件夹'"
      class="panel-empty"
    />
  </NCard>
</template>

<style scoped>
.folder-panel {
  flex: 1;
  min-width: 0;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
}

.panel-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.panel-title {
  font-weight: 600;
  font-size: 15px;
}

.panel-hint {
  font-size: 12px;
}

.path-list {
  background: transparent;
}

.path-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.path-icon {
  flex-shrink: 0;
  opacity: 0.7;
}

.path-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-family: Consolas, 'Cascadia Code', monospace;
}

.remove-btn {
  flex-shrink: 0;
}

.panel-empty {
  padding: 12px 0;
}
</style>
