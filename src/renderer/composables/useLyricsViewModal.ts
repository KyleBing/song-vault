import { reactive } from 'vue'

export const lyricsViewModalState = reactive({
    show: false,
    lrcPath: ''
})

export function openLyricsViewModal(lrcPath: string): void {
    const path = lrcPath.trim()
    if (!path) return
    lyricsViewModalState.lrcPath = path
    lyricsViewModalState.show = true
}

export function closeLyricsViewModal(): void {
    lyricsViewModalState.show = false
}
