import { ipcMain } from 'electron'
import {
    BatchCancelledError,
    runWithCancelCheck,
    runWithCancelCheckAsync,
    type BatchCancelCheck
} from '../shared/batchCancel'

const cancelledJobIds = new Set<string>()

export function registerBatchCancelIpc(): void {
    ipcMain.handle('cancel-batch-job', (_, jobId: unknown) => {
        if (typeof jobId === 'string' && jobId.trim()) {
            cancelledJobIds.add(jobId.trim())
        }
    })

    ipcMain.handle('clear-batch-job', (_, jobId: unknown) => {
        if (typeof jobId === 'string' && jobId.trim()) {
            cancelledJobIds.delete(jobId.trim())
        }
    })
}

export function makeJobCancelCheck(jobId: string | undefined): BatchCancelCheck {
    if (!jobId?.trim()) {
        return () => {}
    }
    const id = jobId.trim()
    return () => {
        if (cancelledJobIds.has(id)) {
            throw new BatchCancelledError()
        }
    }
}

export function clearBatchJob(jobId: string | undefined): void {
    if (jobId?.trim()) {
        cancelledJobIds.delete(jobId.trim())
    }
}

/** 主进程 IPC handler 内包裹批处理，自动安装/清理取消检查 */
export function runWithBatchJob<T>(
    jobId: string | undefined,
    fn: () => T
): T {
    try {
        return runWithCancelCheck(makeJobCancelCheck(jobId), fn)
    } finally {
        clearBatchJob(jobId)
    }
}

export async function runWithBatchJobAsync<T>(
    jobId: string | undefined,
    fn: () => Promise<T>
): Promise<T> {
    try {
        return await runWithCancelCheckAsync(makeJobCancelCheck(jobId), fn)
    } finally {
        clearBatchJob(jobId)
    }
}
