import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface BatchProgressSnapshot {
    title: string
    percentage?: number
    detail?: string
    indeterminate?: boolean
    onCancel: () => void
}

export const useBatchProgressStore = defineStore('batchProgress', () => {
    const snapshot = ref<BatchProgressSnapshot | null>(null)
    let ownerId: symbol | null = null

    function publish(id: symbol, next: BatchProgressSnapshot): void {
        ownerId = id
        snapshot.value = next
    }

    /** 仅清除由同一 owner 发布的进度，避免多页面互相覆盖 */
    function clear(id: symbol): void {
        if (ownerId === id) {
            ownerId = null
            snapshot.value = null
        }
    }

    return { snapshot, publish, clear }
})
