import path from 'path'
import type { AudioFileMetaInfo } from './audioFileMeta'
import type { PathFilterRule } from './pathFilters'
import {
    validateSyncRoots,
    walkLibraryAudioFiles
} from './librarySyncJob'
import { readAudioFileMetaBatch } from './readAudioFileMeta'
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
    MetaTagMismatchReason,
    MetaTagMismatchScanStats,
    ScanMetaTagMismatchParams,
    ScanMetaTagMismatchResult
} from './metaTagMismatch'

export { analyzeMetaTagMismatch, artistTagMatchesFilename } from './metaTagMismatch'

/** 扫描目录内「文件名艺人 - 曲名」与内嵌标签不一致的音频 */
export async function scanMetaTagMismatches(
    params: ScanMetaTagMismatchParams
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
    const metaByPath = await readAudioFileMetaBatch(fullPaths, 6)
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

    for (const entry of entries) {
        const fullPath = path.resolve(root, entry.relativePath)
        const meta =
            metaByPath[fullPath] ?? metaByResolved.get(fullPath)
        if (!meta?.ok) {
            skippedCount += 1
            continue
        }

        if (parseArtistTitleFromFilePath(fullPath).split) {
            parsedFilenameCount += 1
        }

        const mismatch = analyzeMetaTagMismatch(fullPath, meta)
        if (!mismatch) continue

        items.push({
            relativePath: entry.relativePath,
            fileName: entry.fileName,
            fullPath,
            ...mismatch
        })
    }

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
