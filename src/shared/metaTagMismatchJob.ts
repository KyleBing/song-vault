import path from 'path'
import type { AudioFileMetaInfo } from './audioFileMeta'
import type { PathFilterRule } from './pathFilters'
import {
    validateSyncRoots,
    walkLibraryAudioFiles
} from './librarySyncJob'
import { checkBatchCancelled } from './batchCancel'
import {
    readAudioFileMetaBatch,
    READ_AUDIO_META_FOR_SCAN
} from './readAudioFileMeta'
import { parseArtistTitleFromFilePath } from './audioMetaEdit'
import {
    analyzeMetaTagMismatch,
    type MetaTagMismatchItem,
    type MetaTagMismatchScanStats,
    type ScanMetaTagMismatchParams,
    type ScanMetaTagMismatchResult
} from './metaTagMismatch'

export type {
    MetaTagMismatchItem,
    MetaTagMismatchIssue,
    MetaTagMismatchReason,
    MetaTagMismatchScanStats,
    ScanMetaTagMismatchParams,
    ScanMetaTagMismatchResult
} from './metaTagMismatch'

export {
    analyzeMetaTagMismatch,
    artistTagMatchesFilename,
    extArtistMatchesFilename,
    extTitleMatchesFilename,
    countItemsByIssue,
    META_TAG_MISMATCH_ISSUE_LABELS,
    normalizeFilenameArtist,
    tagArtistForMetaFromFilename,
    tagArtistFromFilenameArtist
} from './metaTagMismatch'

export type MetaTagMismatchScanPhase = 'read' | 'compare'

export type MetaTagMismatchScanProgress = (
    done: number,
    total: number,
    phase: MetaTagMismatchScanPhase
) => void

/**
 * 扫描目录内「文件名艺人 - 曲名」与内嵌标签不一致的音频。
 * 阶段 1：全量读取内嵌标签（每个文件只读一次）；
 * 阶段 2：在内存中与文件名对比，不再访问文件内容。
 */
export async function scanMetaTagMismatches(
    params: ScanMetaTagMismatchParams & {
        onProgress?: MetaTagMismatchScanProgress
    }
): Promise<ScanMetaTagMismatchResult> {
    const rootInput = (params?.root ?? '').trim()
    if (!rootInput) {
        throw new Error('未指定扫描目录')
    }

    const check = validateSyncRoots(rootInput, rootInput).left
    if (!check.ok) {
        throw new Error(check.error ?? '目录无效')
    }

    const root = check.path
    const pathFilterRules = params.pathFilterRules ?? []
    const fileMap = walkLibraryAudioFiles(root, pathFilterRules)
    const entries = [...fileMap.values()]

    const fullPaths = entries.map((entry) =>
        path.resolve(root, entry.relativePath)
    )
    const total = fullPaths.length
    params.onProgress?.(0, total, 'read')

    const metaByPath = await readAudioFileMetaBatch(
        fullPaths,
        8,
        (done, batchTotal) => {
            params.onProgress?.(done, batchTotal, 'read')
        },
        READ_AUDIO_META_FOR_SCAN
    )

    /** 按解析后的绝对路径索引，避免 join / resolve 字符串不一致导致查不到元数据 */
    const metaByResolved = new Map<string, AudioFileMetaInfo>()
    for (const meta of Object.values(metaByPath)) {
        if (meta?.filePath) {
            metaByResolved.set(path.resolve(meta.filePath), meta)
        }
    }

    const items: MetaTagMismatchItem[] = []
    let parsedFilenameCount = 0
    let skippedCount = 0

    for (let i = 0; i < entries.length; i++) {
        checkBatchCancelled()
        const entry = entries[i]!
        const fullPath = path.resolve(root, entry.relativePath)
        const meta =
            metaByPath[fullPath] ?? metaByResolved.get(fullPath)
        if (!meta?.ok) {
            skippedCount += 1
        } else {
            if (parseArtistTitleFromFilePath(fullPath).split) {
                parsedFilenameCount += 1
            }

            const mismatch = analyzeMetaTagMismatch(fullPath, meta)
            if (mismatch) {
                items.push({
                    relativePath: entry.relativePath,
                    fileName: entry.fileName,
                    fullPath,
                    ...mismatch
                })
            }
        }
    }

    params.onProgress?.(total, total, 'read')

    items.sort((a, b) =>
        a.relativePath.localeCompare(b.relativePath, undefined, {
            sensitivity: 'base'
        })
    )

    const stats: MetaTagMismatchScanStats = {
        fileCount: entries.length,
        parsedFilenameCount,
        mismatchCount: items.length,
        skippedCount
    }

    return { root, stats, items }
}
