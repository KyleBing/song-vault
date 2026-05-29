<script setup lang="ts">
import { NEllipsis, NSelect } from 'naive-ui'
import { computed, h } from 'vue'
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

function renderLabel(option: { label: string; value: string }) {
    return h(
        NEllipsis,
        { tooltip: { placement: 'top' } },
        { default: () => option.label }
    )
}

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
        :render-label="renderLabel"
        :consistent-menu-width="false"
        to="body"
        @update:value="onChange"
    />
</template>

<style lang="scss" scoped>
@use '../../styles/variables' as *;

.source-lrc-select-empty {
    display: block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--app-data-table-font-size, 12px);
    line-height: 1.4;
    opacity: 0.65;
}

.source-lrc-select {
    width: 100%;
    min-width: 0;
    max-width: 100%;

    :deep(.n-base-selection) {
        min-width: 0;
    }

    :deep(.n-base-selection-label) {
        overflow: hidden;
    }

    :deep(.n-base-selection-label .n-ellipsis) {
        display: block;
        min-width: 0;
    }
}
</style>
