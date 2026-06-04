import { reactive } from 'vue'

export const audioFileContextMenuState = reactive({
    show: false,
    x: 0,
    y: 0,
    filePath: ''
})

export function openAudioFileContextMenu(filePath: string, e: MouseEvent): void {
    const path = filePath.trim()
    if (!path) return
    e.preventDefault()
    e.stopPropagation()
    audioFileContextMenuState.filePath = path
    audioFileContextMenuState.x = e.clientX
    audioFileContextMenuState.y = e.clientY
    audioFileContextMenuState.show = true
}

export function closeAudioFileContextMenu(): void {
    audioFileContextMenuState.show = false
}

export function attachAudioFileContextMenuToRowProps(
    base: Record<string, unknown>,
    filePath: string | null | undefined
): Record<string, unknown> {
    const path = (filePath ?? '').trim()
    if (!path) return base
    return {
        ...base,
        onContextmenu: (e: MouseEvent) => openAudioFileContextMenu(path, e)
    }
}
