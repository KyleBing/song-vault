<script setup lang="ts">
import { NCheckbox, NIcon } from 'naive-ui'
import { ChevronForward } from '@vicons/ionicons5'
import { computed } from 'vue'
import type { SyncDiffItem } from '@shared/librarySyncJob'
import {
    collectSyncDiffFileKeysUnderFolder,
    type SyncDiffTreeRow
} from '@renderer/utils/syncDiffTree'
import SyncDiffFileRow from './SyncDiffFileRow.vue'
import SyncDiffTreeNode from './SyncDiffTreeNode.vue'

const props = defineProps<{
    nodes: SyncDiffTreeRow[]
    depth: number
    expandedKeys: Set<string>
    selectedKeys: Set<string>
    loading: boolean
    batchCopying: boolean
    isCopying: (item: SyncDiffItem, direction: 'left' | 'right') => boolean
}>()

const emit = defineEmits<{
    toggleExpand: [key: string]
    toggleSelect: [key: string, checked: boolean, shiftKey?: boolean]
    toggleFolderSelect: [folder: SyncDiffTreeRow, checked: boolean]
    rowClick: [key: string, event: MouseEvent]
    copyToRight: [item: SyncDiffItem]
    copyToLeft: [item: SyncDiffItem]
}>()

const indentPx = computed(() => `${props.depth * 16}px`)

function isExpanded(key: string): boolean {
    return props.expandedKeys.has(key)
}

function isSelected(key: string): boolean {
    return props.selectedKeys.has(key)
}

function countDiffFiles(row: SyncDiffTreeRow): number {
    if (!row.isFolder || !row.children?.length) return 0
    let count = 0
    function walk(nodes: SyncDiffTreeRow[]): void {
        for (const node of nodes) {
            if (node.isFolder) {
                if (node.children?.length) walk(node.children)
            } else {
                count += 1
            }
        }
    }
    walk(row.children)
    return count
}

function onRowClick(key: string, event: MouseEvent): void {
    emit('rowClick', key, event)
}

let checkShiftKey = false

function onCheckMouseDown(event: MouseEvent): void {
    checkShiftKey = event.shiftKey
}

function onCheckUpdate(key: string, checked: boolean): void {
    emit('toggleSelect', key, checked, checkShiftKey)
}

function folderCheckState(row: SyncDiffTreeRow): {
    checked: boolean
    indeterminate: boolean
} {
    const keys = collectSyncDiffFileKeysUnderFolder(row)
    if (!keys.length) {
        return { checked: false, indeterminate: false }
    }
    const selectedCount = keys.filter((k) => isSelected(k)).length
    if (selectedCount === 0) {
        return { checked: false, indeterminate: false }
    }
    if (selectedCount === keys.length) {
        return { checked: true, indeterminate: false }
    }
    return { checked: false, indeterminate: true }
}

function onFolderCheckUpdate(row: SyncDiffTreeRow, checked: boolean): void {
    emit('toggleFolderSelect', row, checked)
}
</script>

<template>
    <template v-for="node in nodes" :key="node.key">
        <div
            class="sync-tree-row"
            :class="node.isFolder ? 'sync-tree-row--folder' : 'sync-tree-row--file'"
            @click="!node.isFolder && onRowClick(node.key, $event)"
        >
            <div class="sync-tree-row__check" @click.stop @mousedown="onCheckMouseDown">
                <NCheckbox
                    v-if="node.isFolder"
                    :checked="folderCheckState(node).checked"
                    :indeterminate="folderCheckState(node).indeterminate"
                    :disabled="
                        loading
                            || batchCopying
                            || countDiffFiles(node) === 0
                    "
                    size="small"
                    @update:checked="(checked) => onFolderCheckUpdate(node, checked)"
                />
                <NCheckbox
                    v-else
                    :checked="isSelected(node.key)"
                    :disabled="loading || batchCopying"
                    size="small"
                    @update:checked="(checked) => onCheckUpdate(node.key, checked)"
                />
            </div>

            <div
                class="sync-tree-row__body"
                :style="{ paddingLeft: indentPx }"
            >
                <template v-if="node.isFolder">
                    <button
                        type="button"
                        class="sync-tree-row__expand"
                        :class="{ 'sync-tree-row__expand--open': isExpanded(node.key) }"
                        @click.stop="emit('toggleExpand', node.key)"
                    >
                        <NIcon :size="14"><ChevronForward /></NIcon>
                    </button>
                    <span class="sync-tree-folder__name">{{ node.name }}</span>
                    <span class="sync-tree-folder__count">{{ countDiffFiles(node) }}</span>
                </template>

                <SyncDiffFileRow
                    v-else-if="node.diffItem"
                    :item="node.diffItem"
                    :loading="loading || batchCopying"
                    :copying-left="isCopying(node.diffItem, 'left')"
                    :copying-right="isCopying(node.diffItem, 'right')"
                    @copy-to-right="emit('copyToRight', node.diffItem)"
                    @copy-to-left="emit('copyToLeft', node.diffItem)"
                />
            </div>
        </div>

        <SyncDiffTreeNode
            v-if="node.isFolder && node.children?.length && isExpanded(node.key)"
            :nodes="node.children"
            :depth="depth + 1"
            :expanded-keys="expandedKeys"
            :selected-keys="selectedKeys"
            :loading="loading"
            :batch-copying="batchCopying"
            :is-copying="isCopying"
            @toggle-expand="(key) => emit('toggleExpand', key)"
            @toggle-select="(key, checked, shiftKey) => emit('toggleSelect', key, checked, shiftKey)"
            @toggle-folder-select="(folder, checked) => emit('toggleFolderSelect', folder, checked)"
            @row-click="(key, event) => emit('rowClick', key, event)"
            @copy-to-right="(item) => emit('copyToRight', item)"
            @copy-to-left="(item) => emit('copyToLeft', item)"
        />
    </template>
</template>

<style lang="scss" scoped>
@use '../styles/variables' as *;

.sync-tree-row {
    display: flex;
    align-items: stretch;
    height: 22px;
    min-height: 22px;
    max-height: 22px;
    border-bottom: 1px solid $border-subtle;
    box-sizing: border-box;
    cursor: default;

    &--file {
        cursor: pointer;
    }
}

.sync-tree-row__check {
    width: 32px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;

    :deep(.n-checkbox) {
        --n-size: 14px;
    }
}

.sync-tree-row__body {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: stretch;
    box-sizing: border-box;
}

.sync-tree-row--folder .sync-tree-row__body {
    align-items: center;
    gap: 4px;
    padding-right: 8px;
}

.sync-tree-row__expand {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    margin: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    flex-shrink: 0;
    opacity: 0.75;

    &--open :deep(.n-icon) {
        transform: rotate(90deg);
    }
}

.sync-tree-folder__name {
    font-size: 11px;
    font-weight: 600;
    opacity: 0.85;
}

.sync-tree-folder__count {
    font-size: 10px;
    opacity: 0.45;
    font-variant-numeric: tabular-nums;

    &::before {
        content: '(';
    }

    &::after {
        content: ')';
    }
}
</style>
