<script setup lang="ts">
import { NButton, NIcon } from 'naive-ui'
import { ArrowBack, ArrowForward } from '@vicons/ionicons5'
import { formatFileSize } from '@shared/formatAudioDisplay'
import type { SyncDiffItem, SyncDiffKind, SyncFileEntry } from '@shared/librarySyncJob'
import { joinUnderRoot } from '@shared/pathLite'
import { openAudioFileContextMenu } from '@renderer/composables/useAudioFileContextMenu'

const props = defineProps<{
    item: SyncDiffItem
    leftRoot: string
    rightRoot: string
    loading: boolean
    copyingLeft: boolean
    copyingRight: boolean
}>()

const emit = defineEmits<{
    copyToRight: []
    copyToLeft: []
}>()

type PaneTone = 'missing' | 'extra' | 'diff'

function sidePaneTone(
    side: 'left' | 'right',
    kind: SyncDiffKind,
    hasEntry: boolean
): PaneTone {
    if (kind === 'modified' || kind === 'moved') return 'diff'
    if (kind === 'left_only') {
        return side === 'left' ? 'extra' : 'missing'
    }
    if (kind === 'right_only') {
        return side === 'right' ? 'extra' : 'missing'
    }
    return hasEntry ? 'extra' : 'missing'
}

function paneClass(tone: PaneTone, side: 'left' | 'right'): string[] {
    return [
        'sync-diff-pane',
        `sync-diff-pane--${side}`,
        `sync-diff-pane--${tone}`
    ]
}

function fileLine(entry: SyncFileEntry, showPath: boolean): string {
    const label = showPath ? entry.relativePath : entry.fileName
    return `${label}  ${formatFileSize(entry.size)}`
}

function moveToRightTitle(): string {
    return '在右侧乐库内移动到左侧路径'
}

function moveToLeftTitle(): string {
    return '在左侧乐库内移动到右侧路径'
}

function onSideContextMenu(
    side: 'left' | 'right',
    e: MouseEvent
): void {
    const entry = side === 'left' ? props.item.left : props.item.right
    const root = side === 'left' ? props.leftRoot : props.rightRoot
    if (!entry || !root.trim()) return
    openAudioFileContextMenu(joinUnderRoot(root, entry.relativePath), e)
}
</script>

<template>
    <div class="sync-diff-row">
        <div
            :class="paneClass(
                sidePaneTone('left', item.kind, !!item.left),
                'left'
            )"
            @contextmenu="onSideContextMenu('left', $event)"
        >
            <span v-if="item.left" class="sync-file-line">
                {{ fileLine(item.left, item.kind === 'moved') }}
            </span>
            <span v-else class="sync-diff-empty">—</span>
        </div>

        <div class="sync-diff-center" @click.stop>
            <NButton
                v-if="item.left"
                quaternary
                circle
                size="tiny"
                :title="item.kind === 'moved' ? moveToRightTitle() : '复制到右侧'"
                :loading="copyingLeft"
                :disabled="loading"
                @click.stop="emit('copyToRight')"
            >
                <template #icon>
                    <NIcon :size="14"><ArrowForward /></NIcon>
                </template>
            </NButton>
            <NButton
                v-if="item.right"
                quaternary
                circle
                size="tiny"
                :title="item.kind === 'moved' ? moveToLeftTitle() : '复制到左侧'"
                :loading="copyingRight"
                :disabled="loading"
                @click.stop="emit('copyToLeft')"
            >
                <template #icon>
                    <NIcon :size="14"><ArrowBack /></NIcon>
                </template>
            </NButton>
        </div>

        <div
            :class="paneClass(
                sidePaneTone('right', item.kind, !!item.right),
                'right'
            )"
            @contextmenu="onSideContextMenu('right', $event)"
        >
            <span v-if="item.right" class="sync-file-line">
                {{ fileLine(item.right, item.kind === 'moved') }}
            </span>
            <span v-else class="sync-diff-empty">—</span>
        </div>
    </div>
</template>

<style lang="scss" scoped>
@use '../../styles/variables' as *;

.sync-diff-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 48px minmax(0, 1fr);
    align-items: stretch;
    flex: 1;
    min-width: 0;
    width: 100%;
    height: 22px;
    min-height: 22px;
    max-height: 22px;
}

.sync-diff-pane {
    display: flex;
    align-items: center;
    min-width: 0;
    height: 100%;
    padding: 0 8px;
    box-sizing: border-box;
}

.sync-diff-pane--left {
    justify-content: flex-end;
    text-align: right;
}

.sync-diff-pane--right {
    justify-content: flex-start;
    text-align: left;
}

.sync-diff-pane--missing {
    background: rgba(239, 68, 68, 0.22);
}

.sync-diff-pane--extra {
    background: rgba(34, 197, 94, 0.22);
}

.sync-diff-pane--diff {
    background: rgba(59, 130, 246, 0.22);
}

.sync-file-line {
    font-size: 11px;
    line-height: 22px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
    font-family: $font-mono;
}

.sync-diff-empty {
    opacity: 0.4;
    font-size: 11px;
    line-height: 22px;
}

.sync-diff-center {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    height: 100%;
    flex-shrink: 0;
    border-left: 1px solid $border-subtle;
    border-right: 1px solid $border-subtle;
    background: var(--app-surface-raised);

    :deep(.n-button) {
        width: 22px;
        height: 22px;
        min-width: 22px;
        padding: 0;
    }
}
</style>
