<script setup lang="ts">
import { NRadio, NRadioGroup } from 'naive-ui'
import { formatFileSize } from '@shared/formatAudioDisplay'
import type { DuplicateGroup, DuplicateMember } from '@shared/libraryDuplicateTypes'
import { duplicateMemberKey } from '@shared/libraryDuplicateTypes'

defineProps<{
    group: DuplicateGroup
    keepKey: string
}>()

const emit = defineEmits<{
    'update:keepKey': [key: string]
}>()

function onKeepKeyUpdate(value: string | number | boolean | null): void {
    if (typeof value === 'string') {
        emit('update:keepKey', value)
    }
}

function memberLabel(member: DuplicateMember): string {
    return `${member.relativePath}  ${formatFileSize(member.size)}`
}
</script>

<template>
    <div class="dup-group-row">
        <div class="dup-group-row__summary">
            <span class="dup-group-row__name">{{ group.fileName }}</span>
            <span class="dup-group-row__meta">
                {{ formatFileSize(group.size) }} · {{ group.members.length }} 份
            </span>
        </div>
    </div>

    <div class="dup-members" @click.stop>
        <NRadioGroup :value="keepKey" @update:value="onKeepKeyUpdate">
            <NRadio
                v-for="member in group.members"
                :key="duplicateMemberKey(member.relativePath)"
                class="dup-member-radio"
                :value="duplicateMemberKey(member.relativePath)"
            >
                <span class="dup-member-radio__label">{{ memberLabel(member) }}</span>
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
    padding: 6px 8px 8px 40px;
    border-bottom: 1px solid $border-subtle;
    background: var(--app-surface-raised);
}

.dup-member-radio {
    align-items: flex-start;

    :deep(.n-radio__label) {
        min-width: 0;
    }
}

.dup-member-radio__label {
    font-family: $font-mono;
    font-size: 11px;
    line-height: 1.35;
    word-break: break-all;
}
</style>
