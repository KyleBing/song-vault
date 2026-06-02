import { readonly, ref } from 'vue'
import type { DuplicateGroup } from '@shared/libraryDuplicateTypes'

export interface DuplicateCoverComparePayload {
    group: DuplicateGroup
    scanRoot: string
}

const payload = ref<DuplicateCoverComparePayload | null>(null)

export function useDuplicateCoverCompare() {
    function open(next: DuplicateCoverComparePayload): void {
        payload.value = next
    }

    function close(): void {
        payload.value = null
    }

    return {
        payload: readonly(payload),
        open,
        close
    }
}
