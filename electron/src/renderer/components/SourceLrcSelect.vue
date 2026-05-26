<script setup lang="ts">
import { NSelect } from 'naive-ui'
import { computed } from 'vue'
import type { AudioJobItem } from '@shared/lrcJob'
import { relativeToRoots } from '@renderer/utils/displayPath'

const props = defineProps<{
  row: AudioJobItem
  lrcDirs: string[]
  value: string | null
}>()

const emit = defineEmits<{
  pick: [lrcPath: string]
}>()

const options = computed(() =>
  (props.row.sourceLrcPaths ?? []).map((p) => ({
    label: relativeToRoots(p, props.lrcDirs),
    value: p
  }))
)

/** 下拉选定后向父组件上报源歌词路径 */
function onChange(v: string | null): void {
  if (v) emit('pick', v)
}
</script>

<template>
  <NSelect
    class="source-lrc-select"
    size="small"
    placeholder="多个同名，请选择"
    :options="options"
    :value="value"
    :consistent-menu-width="false"
    to="body"
    @update:value="onChange"
  />
</template>

<style lang="scss" scoped>
@use '../styles/variables' as *;

.source-lrc-select {
  width: 100%;
  min-width: 160px;
}
</style>
