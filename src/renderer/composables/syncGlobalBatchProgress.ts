import {
    onScopeDispose,
    toValue,
    watchEffect,
    type MaybeRefOrGetter
} from 'vue'
import {
    useBatchProgressStore,
    type BatchProgressSnapshot
} from '@renderer/stores/batchProgress'
import type { BatchTask } from '@renderer/composables/useBatchTask'

export interface GlobalBatchProgressConfig {
    active: MaybeRefOrGetter<boolean>
    title: MaybeRefOrGetter<string>
    percentage?: MaybeRefOrGetter<number | undefined>
    detail?: MaybeRefOrGetter<string | undefined>
    indeterminate?: MaybeRefOrGetter<boolean | undefined>
    onCancel?: () => void
}

/** 将页面内批处理状态同步到应用底部全局进度条 */
export function syncGlobalBatchProgress(
    batchTask: BatchTask,
    config: GlobalBatchProgressConfig
): void {
    const store = useBatchProgressStore()
    const owner = Symbol('batch-progress-owner')

    watchEffect(() => {
        if (!toValue(config.active)) {
            store.clear(owner)
            return
        }
        const next: BatchProgressSnapshot = {
            title: toValue(config.title),
            percentage: toValue(config.percentage),
            detail: toValue(config.detail),
            indeterminate: toValue(config.indeterminate),
            onCancel: config.onCancel ?? (() => batchTask.cancel())
        }
        store.publish(owner, next)
    })

    onScopeDispose(() => {
        store.clear(owner)
    })
}
