import type { Ref } from 'vue'
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useMessage } from 'naive-ui'
import { attachAudioFileContextMenuToRowProps } from '@renderer/composables/useAudioFileContextMenu'
import { useAudioPlayerStore } from '@renderer/stores/audioPlayer'

const PLAYING_ROW_CLASS = 'audio-table-row--playing'

function mergeRowClass(
    base: Record<string, unknown>,
    extra: string | undefined
): string | undefined {
    const baseClass = typeof base.class === 'string' ? base.class : ''
    const parts = [baseClass, extra].filter(Boolean)
    return parts.length ? parts.join(' ') : undefined
}

/** 播放状态变化时递增，供表格重绘以更新行高亮 */
export function useAudioPlayRowHighlightKey() {
    const { filePath } = storeToRefs(useAudioPlayerStore())
    return computed(() => filePath.value ?? '')
}

/** 在表格行上增加双击播放，并为当前播放行添加高亮 class */
export function useAudioPlayRowProps(
    baseRowProps: (
        row: unknown,
        orderedKeys: Ref<string[]> | string[]
    ) => Record<string, unknown>,
    getFilePath: (row: unknown) => string
) {
    const player = useAudioPlayerStore()
    const { filePath: playingFilePath } = storeToRefs(player)
    const message = useMessage()
    const playRowHighlightKey = useAudioPlayRowHighlightKey()

    function wrapRowProps(
        row: unknown,
        orderedKeys: Ref<string[]> | string[]
    ): Record<string, unknown> {
        void playRowHighlightKey.value

        const base = baseRowProps(row, orderedKeys)
        const path = getFilePath(row)
        const isPlayingRow =
            playingFilePath.value !== null && playingFilePath.value === path

        return attachAudioFileContextMenuToRowProps(
            {
                ...base,
                class: mergeRowClass(
                    base,
                    isPlayingRow ? PLAYING_ROW_CLASS : undefined
                ),
                title: '双击播放',
                onDblclick: (e: MouseEvent) => {
                    e.preventDefault()
                    e.stopPropagation()
                    void (async () => {
                        await player.play(path)
                        if (player.lastError) {
                            message.error(player.lastError, { duration: 4000 })
                        }
                    })()
                }
            },
            path
        )
    }

    return {
        rowProps: wrapRowProps,
        playRowHighlightKey
    }
}
