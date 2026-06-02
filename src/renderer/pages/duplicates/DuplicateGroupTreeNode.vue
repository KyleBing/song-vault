<script setup lang="ts">
import { NCheckbox, NIcon } from 'naive-ui'
import { ChevronForward } from '@vicons/ionicons5'
import { computed } from 'vue'
import {
    collectDuplicateGroupKeysUnderFolder,
    type DuplicateGroupTreeRow
} from '@renderer/utils/duplicateGroupTree'
import DuplicateGroupFileRow from './DuplicateGroupFileRow.vue'
import DuplicateGroupTreeNode from './DuplicateGroupTreeNode.vue'

const props = defineProps<{
    nodes: DuplicateGroupTreeRow[]
    depth: number
    expandedKeys: Set<string>
    selectedKeys: Set<string>
    keepKeys: Record<string, string>
    scanRoot: string
    loading: boolean
    deleting: boolean
}>()

const emit = defineEmits<{
    toggleExpand: [key: string]
    toggleSelect: [key: string, checked: boolean, shiftKey?: boolean]
    toggleFolderSelect: [folder: DuplicateGroupTreeRow, checked: boolean]
    rowClick: [key: string, event: MouseEvent]
    'update:keepKey': [groupId: string, key: string]
}>()

const indentPx = computed(() => `${props.depth * 16}px`)

function isExpanded(key: string): boolean {
    return props.expandedKeys.has(key)
}

function isSelected(key: string): boolean {
    return props.selectedKeys.has(key)
}

function countGroups(row: DuplicateGroupTreeRow): number {
    if (!row.isFolder || !row.children?.length) return 0
    let count = 0
    function walk(nodes: DuplicateGroupTreeRow[]): void {
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

function folderCheckState(row: DuplicateGroupTreeRow): {
    checked: boolean
    indeterminate: boolean
} {
    const keys = collectDuplicateGroupKeysUnderFolder(row)
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

function onFolderCheckUpdate(row: DuplicateGroupTreeRow, checked: boolean): void {
    emit('toggleFolderSelect', row, checked)
}
</script>

<template>
    <template v-for="node in nodes" :key="node.key">
        <div
            class="dup-tree-row"
            :class="node.isFolder ? 'dup-tree-row--folder' : 'dup-tree-row--group'"
            @click="!node.isFolder && onRowClick(node.key, $event)"
        >
            <div class="dup-tree-row__check" @click.stop @mousedown="onCheckMouseDown">
                <NCheckbox
                    v-if="node.isFolder"
                    :checked="folderCheckState(node).checked"
                    :indeterminate="folderCheckState(node).indeterminate"
                    :disabled="loading || deleting || countGroups(node) === 0"
                    size="small"
                    @update:checked="(checked) => onFolderCheckUpdate(node, checked)"
                />
                <NCheckbox
                    v-else
                    :checked="isSelected(node.key)"
                    :disabled="loading || deleting"
                    size="small"
                    @update:checked="(checked) => onCheckUpdate(node.key, checked)"
                />
            </div>

            <div
                class="dup-tree-row__body"
                :style="{ paddingLeft: indentPx }"
            >
                <template v-if="node.isFolder">
                    <button
                        type="button"
                        class="dup-tree-row__expand"
                        :class="{ 'dup-tree-row__expand--open': isExpanded(node.key) }"
                        @click.stop="emit('toggleExpand', node.key)"
                    >
                        <NIcon :size="14"><ChevronForward /></NIcon>
                    </button>
                    <span class="dup-tree-folder__name">{{ node.name }}</span>
                    <span class="dup-tree-folder__count">{{ countGroups(node) }}</span>
                </template>

                <DuplicateGroupFileRow
                    v-else-if="node.group"
                    :keep-key="keepKeys[node.group.id] ?? node.group.suggestedKeepKey"
                    :group="node.group"
                    :scan-root="scanRoot"
                    @update:keep-key="emit('update:keepKey', node.group!.id, $event)"
                />
            </div>
        </div>

        <DuplicateGroupTreeNode
            v-if="node.isFolder && node.children?.length && isExpanded(node.key)"
            :nodes="node.children"
            :depth="depth + 1"
            :expanded-keys="expandedKeys"
            :selected-keys="selectedKeys"
            :keep-keys="keepKeys"
            :scan-root="scanRoot"
            :loading="loading"
            :deleting="deleting"
            @toggle-expand="(key) => emit('toggleExpand', key)"
            @toggle-select="(key, checked, shiftKey) => emit('toggleSelect', key, checked, shiftKey)"
            @toggle-folder-select="(folder, checked) => emit('toggleFolderSelect', folder, checked)"
            @row-click="(key, event) => emit('rowClick', key, event)"
            @update:keep-key="(groupId, key) => emit('update:keepKey', groupId, key)"
        />
    </template>
</template>

<style lang="scss" scoped>
@use '../../styles/variables' as *;

.dup-tree-row {
    display: flex;
    align-items: stretch;
    border-bottom: 1px solid $border-subtle;
    box-sizing: border-box;
    cursor: default;

    &--group {
        cursor: pointer;
    }
}

.dup-tree-row__check {
    width: 32px;
    flex-shrink: 0;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 6px;

    :deep(.n-checkbox) {
        --n-size: 14px;
    }
}

.dup-tree-row--folder .dup-tree-row__check {
    align-items: center;
    padding-top: 0;
}

.dup-tree-row__body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
}

.dup-tree-row--folder .dup-tree-row__body {
    flex-direction: row;
    align-items: center;
    gap: 4px;
    min-height: 22px;
    max-height: 22px;
    padding-right: 8px;
}

.dup-tree-row__expand {
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

.dup-tree-folder__name {
    font-size: 11px;
    font-weight: 600;
    opacity: 0.85;
}

.dup-tree-folder__count {
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
