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

    function publish(next: BatchProgressSnapshot): void {
        snapshot.value = next
    }

    function clear(): void {
        snapshot.value = null
    }

    return { snapshot, publish, clear }
})
