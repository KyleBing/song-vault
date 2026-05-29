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

const props = withDefaults(
  defineProps<{
    /** 面板标题（hideHeader 为 true 时可省略） */
    title?: string
    /** 副标题说明（hideHeader 为 true 时可由父级展示） */
    hint?: string
    /** 列表为空时的提示 */
    emptyText?: string
    /** 标题与说明由父级放在卡片外时设为 true */
    hideHeader?: boolean
  }>(),
  {
    title: '',
    hint: '',
    hideHeader: false
  }
)

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
    <template v-if="!props.hideHeader" #header>
      <div class="panel-header">
        <span class="panel-title">{{ props.title }}</span>
        <NText v-if="props.hint" depth="3" class="panel-hint">{{ props.hint }}</NText>
      </div>
    </template>
    <NList v-if="paths.length" class="path-list" bordered>
      <NListItem size="small" v-for="(p, index) in paths" :key="p">
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
      :description="emptyText ?? '尚未添加文件夹'"
      class="panel-empty"
    />

    <NButton secondary type="primary" size="small" class="add-folder-btn" @click="addFolder">
      <template #icon>
        <NIcon><Add /></NIcon>
      </template>
      添加文件夹
    </NButton>
  </NCard>
</template>

<style lang="scss" scoped>
@use '../../styles/variables' as *;

.folder-panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: $surface-panel;
  border: 1px solid $border-subtle;
  border-radius: $radius-panel;

  :deep(.n-card__content) {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
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
  flex: 1;
  min-height: 0;
  overflow-y: auto;
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
  line-height: 1;
  font-family: $font-mono;
}

.remove-btn {
  flex-shrink: 0;
}

.panel-empty {
  flex: 1;
  min-height: 48px;
  padding: 12px 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.add-folder-btn {
  flex-shrink: 0;
  margin-top: 12px;
  align-self: flex-start;
}
</style>
