<script setup lang="ts">
import { NDropdown, useMessage, type DropdownOption } from 'naive-ui'
import {
    audioFileContextMenuState,
    closeAudioFileContextMenu
} from '@renderer/composables/useAudioFileContextMenu'
import { revealFileInFileManager } from '@renderer/utils/openInFileManager'

const message = useMessage()

const menuOptions: DropdownOption[] = [
    { label: '打开文件所在位置', key: 'reveal' }
]

async function onMenuSelect(key: string): Promise<void> {
    const filePath = audioFileContextMenuState.filePath
    closeAudioFileContextMenu()
    if (key === 'reveal' && filePath) {
        await revealFileInFileManager(filePath, message)
    }
}
</script>

<template>
    <NDropdown
        trigger="manual"
        placement="bottom-start"
        :show="audioFileContextMenuState.show"
        :x="audioFileContextMenuState.x"
        :y="audioFileContextMenuState.y"
        :options="menuOptions"
        @select="onMenuSelect"
        @clickoutside="closeAudioFileContextMenu"
    />
</template>
