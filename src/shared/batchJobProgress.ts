/** 主进程 → 渲染进程：批处理进度（需匹配 jobId） */
export const BATCH_JOB_PROGRESS_CHANNEL = 'batch-job-progress' as const

export interface BatchJobProgressPayload {
    jobId: string
    done: number
    total: number
    /** read=读标签；compare=内存对比；scanLeft/scanRight=扫目录；compareSync=乐库路径对比 */
    phase?: 'read' | 'compare' | 'scanLeft' | 'scanRight' | 'compareSync'
}

export type BatchJobProgressCallback = (
    payload: BatchJobProgressPayload
) => void
