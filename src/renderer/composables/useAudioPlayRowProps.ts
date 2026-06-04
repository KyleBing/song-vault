import type { Ref } from 'vue'
import { useMessage } from 'naive-ui'
import { attachAudioFileContextMenuToRowProps } from '@renderer/composables/useAudioFileContextMenu'
import { useAudioPlayerStore } from '@renderer/stores/audioPlayer'

/** 在表格行上增加双击播放 */
export function useAudioPlayRowProps(
    baseRowProps: (
        row: unknown,
        orderedKeys: Ref<string[]> | string[]
    ) => Record<string, unknown>,
    getFilePath: (row: unknown) => string
) {
    const player = useAudioPlayerStore()
    const message = useMessage()

    return function wrapRowProps(
        row: unknown,
        orderedKeys: Ref<string[]> | string[]
    ): Record<string, unknown> {
        const base = baseRowProps(row, orderedKeys)
        return attachAudioFileContextMenuToRowProps(
            {
                ...base,
                title: '双击播放',
                onDblclick: (e: MouseEvent) => {
                    e.preventDefault()
                    e.stopPropagation()
                    void (async () => {
                        await player.play(getFilePath(row))
                        if (player.lastError) {
                            message.error(player.lastError, { duration: 4000 })
                        }
                    })()
                }
            },
            getFilePath(row)
        )
    }
}
