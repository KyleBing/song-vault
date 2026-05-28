<script setup lang="ts">
import { NButton, NIcon, NInput } from 'naive-ui'
import { Close, FolderOpen } from '@vicons/ionicons5'

const path = defineModel<string>({ required: true })
const alias = defineModel<string>('alias', { default: '' })

defineProps<{
    aliasPlaceholder?: string
    pathPlaceholder?: string
}>()

async function pickFolder(): Promise<void> {
    const picked = await window.electronAPI.pickDirectory()
    if (picked) path.value = picked
}

function clearPath(): void {
    path.value = ''
}
</script>

<template>
    <div class="sync-folder-field">
        <label class="sync-folder-field__alias">
            <span class="sync-folder-field__label">别名</span>
            <NInput
                v-model:value="alias"
                :placeholder="aliasPlaceholder ?? '例如：本机曲库'"
                size="small"
            />
        </label>

        <label class="sync-folder-field__path-wrap">
            <span class="sync-folder-field__label">目录</span>
            <div class="sync-folder-field__path-row">
                <NInput
                    v-model:value="path"
                    type="textarea"
                    :placeholder="pathPlaceholder ?? '选择文件夹'"
                    size="small"
                    readonly
                    :autosize="{ minRows: 2, maxRows: 4 }"
                    class="sync-folder-field__path"
                />
                <div class="sync-folder-field__actions">
                    <NButton size="small" secondary @click="pickFolder">
                        <template #icon>
                            <NIcon><FolderOpen /></NIcon>
                        </template>
                        选择
                    </NButton>
                    <NButton
                        v-if="path"
                        size="small"
                        quaternary
                        circle
                        @click="clearPath"
                    >
                        <template #icon>
                            <NIcon><Close /></NIcon>
                        </template>
                    </NButton>
                </div>
            </div>
        </label>
    </div>
</template>

<style lang="scss" scoped>
@use '../styles/variables' as *;
.sync-folder-field {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
}

.sync-folder-field__label {
    display: block;
    margin-bottom: 4px;
    font-size: 11px;
    opacity: 0.6;
}

.sync-folder-field__alias,
.sync-folder-field__path-wrap {
    display: block;
    min-width: 0;
}

.sync-folder-field__path-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    min-width: 0;
}

.sync-folder-field__path {
    flex: 1;
    min-width: 0;

    :deep(textarea) {
        font-family: $font-mono;
        font-size: 11px;
        line-height: 1.4;
        word-break: break-all;
    }
}

.sync-folder-field__actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
}
</style>
