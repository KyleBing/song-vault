import { reactive } from 'vue'
import { useMessage } from 'naive-ui'
import {
    BatchCancelledError,
    isBatchCancelledError,
    runWithCancelCheck,
    type BatchCancelCheck
} from '@shared/batchCancel'

export type BatchTask = ReturnType<typeof useBatchTask>

/** 管理可取消批处理：生成 jobId、触发主进程取消、本地循环检查 */
export function useBatchTask() {
    const message = useMessage()
    let localCancelled = false

    const batchTask = reactive({
        active: false,
        jobId: null as string | null,

        cancel(): void {
            if (!batchTask.active) return
            localCancelled = true
            if (batchTask.jobId) {
                void window.electronAPI.cancelBatchJob(batchTask.jobId)
            }
        },

        /** @returns jobId（若启用主进程取消） */
        begin(options?: { useMainJob?: boolean }): string | null {
            batchTask.active = true
            localCancelled = false
            const useMain = options?.useMainJob !== false
            batchTask.jobId = useMain ? crypto.randomUUID() : null
            return batchTask.jobId
        },

        end(): void {
            const id = batchTask.jobId
            batchTask.active = false
            batchTask.jobId = null
            localCancelled = false
            if (id) {
                void window.electronAPI.clearBatchJob(id)
            }
        },

        createCheck(): BatchCancelCheck {
            return () => {
                if (localCancelled) {
                    throw new BatchCancelledError()
                }
            }
        },

        withLocalCancel<T>(fn: () => T): T {
            return runWithCancelCheck(batchTask.createCheck(), fn)
        },

        notifyIfCancelled(err: unknown): boolean {
            if (!isBatchCancelledError(err)) return false
            message.info('已取消')
            return true
        }
    })

    return batchTask
}
