<script setup lang="ts">
import { NButton, NCheckbox, NCheckboxGroup, NSpace, NText } from 'naive-ui'
import { computed } from 'vue'
import type { FileListColumnsSettings } from '@shared/appConfig'
import {
  FILE_LIST_COLUMN_CATEGORY_LABELS,
  FILE_LIST_COLUMN_DEFS,
  createDefaultFileListColumns,
  type FileListColumnCategory,
  type FileListColumnId,
  type FileListKind
} from '@shared/fileListColumns'

const model = defineModel<FileListColumnsSettings>({ required: true })

const props = withDefaults(
  defineProps<{
    kind: FileListKind
    title?: string
    /** 标题由父级放在卡片外时设为 true */
    hideTitle?: boolean
  }>(),
  {
    title: '',
    hideTitle: false
  }
)

const defsForKind = computed(() =>
  FILE_LIST_COLUMN_DEFS.filter((d) => d.kinds.includes(props.kind))
)

const columnIds = computed({
  get(): FileListColumnId[] {
    return props.kind === 'source' ? model.value.source : model.value.decode
  },
  set(ids: FileListColumnId[]) {
    const picked = new Set(ids)
    const ordered = defsForKind.value
      .map((d) => d.id)
      .filter((id) => picked.has(id))
    if (props.kind === 'source') {
      model.value = { ...model.value, source: ordered }
    } else {
      model.value = { ...model.value, decode: ordered }
    }
  }
})

const categories = computed(() => {
  const set = new Set<FileListColumnCategory>()
  for (const d of defsForKind.value) set.add(d.category)
  const order: FileListColumnCategory[] = ['basic', 'time', 'audio', 'tag']
  return order.filter((c) => set.has(c))
})

function defsInCategory(cat: FileListColumnCategory) {
  return defsForKind.value.filter((d) => d.category === cat)
}

function resetDefaults(): void {
  const defaults = createDefaultFileListColumns()
  columnIds.value =
    props.kind === 'source' ? [...defaults.source] : [...defaults.decode]
}
</script>

<template>
  <div class="columns-editor">
    <div class="columns-editor-head">
      <span v-if="!props.hideTitle" class="columns-editor-title">{{ props.title }}</span>
      <NButton
        size="tiny"
        quaternary
        class="columns-editor-reset"
        @click="resetDefaults"
      >
        恢复默认
      </NButton>
    </div>
    <NText depth="3" class="columns-editor-hint">
      <template v-if="kind === 'decode'">
        勾选要在表格中显示的列（加密文件无法读取内嵌标签与音频参数，故不提供相关选项）
      </template>
      <template v-else>
        勾选要在表格中显示的列；无法解析的文件将显示为 —
      </template>
    </NText>
    <NCheckboxGroup v-model:value="columnIds" class="columns-groups">
      <div
        v-for="cat in categories"
        :key="cat"
        class="column-category"
      >
        <div class="column-category-label">
          {{ FILE_LIST_COLUMN_CATEGORY_LABELS[cat] }}
        </div>
        <NSpace :size="[12, 8]" wrap>
          <NCheckbox
            v-for="def in defsInCategory(cat)"
            :key="def.id"
            :value="def.id"
            :label="def.label"
          />
        </NSpace>
      </div>
    </NCheckboxGroup>
  </div>
</template>

<style lang="scss" scoped>
@use '../../styles/variables' as *;

.columns-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
}

.columns-editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.columns-editor-reset {
  margin-left: auto;
}

.columns-editor-title {
  font-size: 14px;
  font-weight: 600;
}

.columns-editor-hint {
  font-size: 12px;
  line-height: 1.45;
}

.columns-groups {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.column-category-label {
  font-size: 12px;
  font-weight: 600;
  opacity: 0.55;
  margin-bottom: 8px;
}
</style>
