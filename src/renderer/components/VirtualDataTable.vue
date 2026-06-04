<script setup lang="ts">
import { computed } from 'vue'
import { NDataTable } from 'naive-ui'
import { useAudioPlayRowHighlightKey } from '@renderer/composables/useAudioPlayRowProps'
import { useDataTableDisplay } from '@renderer/composables/useDataTableDisplay'
import {
    dataTableCellPadding,
    dataTableHeaderHeight,
    dataTableHeightForRow,
    dataTableRowHeight,
    dataTableThemeOverrides
} from '@shared/dataTableDisplay'

const display = useDataTableDisplay()
const playRowHighlightKey = useAudioPlayRowHighlightKey()
const fontSizePx = computed(() => display.value.fontSizePx)
const rowHeight = computed(() => dataTableRowHeight(fontSizePx.value))
const headerHeight = computed(() => dataTableHeaderHeight(fontSizePx.value))

const themeOverrides = computed(() => dataTableThemeOverrides(fontSizePx.value))

const tableStyle = computed(() => ({
    '--vdt-cell-padding': dataTableCellPadding(fontSizePx.value),
    '--vdt-row-height': `${rowHeight.value}px`,
    '--vdt-header-height': `${headerHeight.value}px`,
    '--vdt-font-size': `${fontSizePx.value}px`
}))

function heightForRow(): number {
    return dataTableHeightForRow(fontSizePx.value)
}
</script>

<template>
    <NDataTable
        class="virtual-data-table"
        :data-audio-play-highlight="playRowHighlightKey"
        virtual-scroll
        :min-row-height="rowHeight"
        :header-height="headerHeight"
        :height-for-row="heightForRow"
        :theme-overrides="themeOverrides"
        :style="tableStyle"
        v-bind="$attrs"
    />
</template>

<style lang="scss">
.n-data-table.virtual-data-table {
    font-size: var(--vdt-font-size);

    .n-data-table-th {
        padding: var(--vdt-cell-padding) !important;
        height: var(--vdt-header-height);
        line-height: 1.25;
        font-size: var(--vdt-font-size);
    }

    .n-data-table-td:not(.n-data-table-td--selection):not(.n-data-table-td--expand) {
        padding: var(--vdt-cell-padding) !important;
        line-height: 1.25;
        font-size: var(--vdt-font-size);
    }
}
</style>
