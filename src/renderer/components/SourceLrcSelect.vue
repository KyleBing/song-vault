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

function onChange(v: string | null): void {
    if (v) emit('pick', v)
}
</script>

<template>
    <span v-if="options.length === 0" class="source-lrc-select-empty">
        无可选源歌词
    </span>
    <NSelect
        v-else
        class="source-lrc-select"
        size="small"
        placeholder="请选择"
        :options="options"
        :value="value"
        :consistent-menu-width="false"
        to="body"
        @update:value="onChange"
    />
</template>

<style lang="scss" scoped>
@use '../styles/variables' as *;

.source-lrc-select-empty {
    font-size: 12px;
    line-height: 1.4;
    opacity: 0.65;
}

.source-lrc-select {
    width: 100%;
    min-width: 120px;
    max-width: 100%;
}
</style>
