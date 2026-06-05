/** 批处理任务取消：主进程与渲染进程共用 */

export class BatchCancelledError extends Error {
    readonly cancelled = true

    constructor(message = '操作已取消') {
        super(message)
        this.name = 'BatchCancelledError'
    }
}

export type BatchCancelCheck = () => void

export interface BatchJobParams {
    /** 渲染进程生成，用于取消长时间批处理 */
    jobId?: string
}

let activeCancelCheck: BatchCancelCheck | null = null

/** 在批处理作用域内安装取消检查（主进程 IPC 或渲染进程本地） */
export function runWithCancelCheck<T>(
    check: BatchCancelCheck | undefined,
    fn: () => T
): T {
    const prev = activeCancelCheck
    activeCancelCheck = check ?? null
    try {
        return fn()
    } finally {
        activeCancelCheck = prev
    }
}

/** 异步批处理：须保持取消检查直至 Promise 结束 */
export async function runWithCancelCheckAsync<T>(
    check: BatchCancelCheck | undefined,
    fn: () => Promise<T>
): Promise<T> {
    const prev = activeCancelCheck
    activeCancelCheck = check ?? null
    try {
        return await fn()
    } finally {
        activeCancelCheck = prev
    }
}

/** 在循环/递归中调用；若已取消则抛出 BatchCancelledError */
export function checkBatchCancelled(): void {
    activeCancelCheck?.()
}

export function isBatchCancelledError(err: unknown): err is BatchCancelledError {
    if (err instanceof BatchCancelledError) return true
    if (err instanceof Error) {
        if (err.name === 'BatchCancelledError') return true
        if (err.message.includes('操作已取消')) return true
        if (/scan-meta-tag-mismatches/i.test(err.message) && err.message.includes('取消')) {
            return true
        }
    }
    return false
}

export function batchJobIdFromParams(params: unknown): string | undefined {
    if (!params || typeof params !== 'object') return undefined
    const id = (params as BatchJobParams).jobId
    return typeof id === 'string' && id.trim() ? id.trim() : undefined
}
