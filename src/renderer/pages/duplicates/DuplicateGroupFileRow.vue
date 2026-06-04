<script setup lang="ts">
import { NRadio, NRadioGroup } from 'naive-ui'
import { computed } from 'vue'
import { formatFileSize } from '@shared/formatAudioDisplay'
import type { DuplicateGroup, DuplicateMember } from '@shared/libraryDuplicateTypes'
import { duplicateMemberKey } from '@shared/libraryDuplicateTypes'
import { joinUnderRoot } from '@shared/pathLite'
import { openAudioFileContextMenu } from '@renderer/composables/useAudioFileContextMenu'
import { useDuplicateCoverCompare } from '@renderer/composables/useDuplicateCoverCompare'
import DuplicateMemberCoverThumb from './DuplicateMemberCoverThumb.vue'
import { duplicateMemberMetricsLabel } from './duplicateMemberMetrics'

const props = defineProps<{
    group: DuplicateGroup
    keepKey: string
    scanRoot: string
}>()

const { open: openCoverCompare } = useDuplicateCoverCompare()

const sizeMeta = computed(() => {
    const sizes = new Set(props.group.members.map((member) => member.size))
    if (sizes.size <= 1) {
        return formatFileSize(props.group.members[0]?.size ?? props.group.size)
    }
    return '大小不一致'
})

const emit = defineEmits<{
    'update:keepKey': [key: string]
}>()

function onKeepKeyUpdate(value: string | number | boolean | null): void {
    if (typeof value === 'string') {
        emit('update:keepKey', value)
    }
}

function memberFullPath(member: DuplicateMember): string {
    return joinUnderRoot(props.scanRoot, member.relativePath)
}

function openGroupCoverCompare(): void {
    openCoverCompare({
        group: props.group,
        scanRoot: props.scanRoot
    })
}

function memberMetricsLabel(member: DuplicateMember): string {
    return duplicateMemberMetricsLabel(member)
}

function onMemberContextMenu(member: DuplicateMember, e: MouseEvent): void {
    openAudioFileContextMenu(memberFullPath(member), e)
}
</script>

<template>
    <div class="dup-group-row">
        <div class="dup-group-row__summary">
            <span class="dup-group-row__name">{{ group.fileName }}</span>
            <span class="dup-group-row__meta">
                {{ sizeMeta }} · {{ group.members.length }} 份
            </span>
        </div>
    </div>

    <div class="dup-members" @click.stop>
        <NRadioGroup
            class="dup-member-radio-group"
            :value="keepKey"
            @update:value="onKeepKeyUpdate"
        >
            <NRadio
                v-for="member in group.members"
                :key="duplicateMemberKey(member.relativePath)"
                class="dup-member-radio"
                :value="duplicateMemberKey(member.relativePath)"
            >
                <div
                    class="dup-member-row"
                    @contextmenu="onMemberContextMenu(member, $event)"
                >
                    <DuplicateMemberCoverThumb
                        :file-path="memberFullPath(member)"
                        @compare="openGroupCoverCompare"
                    />
                    <span class="dup-member-radio__label">
                        <span class="dup-member-radio__path">{{ member.relativePath }}</span>
                        <span class="dup-member-radio__metrics">{{
                            memberMetricsLabel(member)
                        }}</span>
                    </span>
                </div>
            </NRadio>
        </NRadioGroup>
    </div>
</template>

<style lang="scss" scoped>
@use '../../styles/variables' as *;

.dup-group-row {
    display: flex;
    align-items: center;
    min-height: 28px;
    padding: 4px 8px;
    box-sizing: border-box;
    background: rgba(168, 85, 247, 0.16);
}

.dup-group-row__summary {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    flex: 1;
}

.dup-group-row__name {
    font-size: 11px;
    font-weight: 600;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.dup-group-row__meta {
    font-size: 10px;
    opacity: 0.65;
    line-height: 1.2;
}

.dup-members {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 8px 8px 12px;
    border-bottom: 1px solid $border-subtle;
    background: var(--app-surface-raised);
}

.dup-member-radio-group {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    width: 100%;
}

.dup-member-radio {
    align-items: flex-start;
    width: 100%;
    margin: 0;

    :deep(.n-radio) {
        width: 100%;
        align-items: flex-start;
    }

    :deep(.n-radio__label) {
        min-width: 0;
        flex: 1;
    }
}

.dup-member-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    min-width: 0;
    width: 100%;
}

.dup-member-radio__label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.dup-member-radio__path {
    font-family: $font-mono;
    font-size: 11px;
    line-height: 1.35;
    word-break: break-all;
}

.dup-member-radio__metrics {
    font-size: 10px;
    line-height: 1.3;
    opacity: 0.7;
    font-variant-numeric: tabular-nums;
}
</style>
