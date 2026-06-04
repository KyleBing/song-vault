import path from 'path'
import {
    fileAndTagArtistsMatch,
    fileArtistHasSeparatorIssues,
    tagArtistFromFilenameArtist,
    tagArtistHasSeparatorIssues
} from './artistSeparatorRules'
import type { AudioFileMetaInfo } from './audioFileMeta'
import {
    isEditableAudioMetaPath,
    filenameStemHasTrailingUnderscore,
    parseArtistTitleFromFilePath
} from './audioMetaEdit'
import type { PathFilterRule } from './pathFilters'

/** @deprecated 保留兼容；请用 issues */
export type MetaTagMismatchReason = 'artist' | 'title' | 'both'

export type MetaTagMismatchIssue =
    | 'artistContent'
    | 'titleContent'
    | 'fileArtistSep'
    | 'tagArtistSep'
    | 'fileNameTrailingUnderscore'

export interface MetaTagMismatchItem {
    relativePath: string
    fileName: string
    fullPath: string
    /** 从文件名解析 */
    fileArtist: string
    fileTitle: string
    /** 文件内标签 */
    tagArtist: string
    tagTitle: string
    /** 需处理的问题类型 */
    issues: MetaTagMismatchIssue[]
    /** @deprecated 由 issues 推导，供旧逻辑兼容 */
    reasons: MetaTagMismatchReason[]
    /** 按规则写入标签时的目标艺人（文件名非法时为 null） */
    targetTagArtist: string | null
    /** 是否可写入标签（mp3 / flac） */
    editable: boolean
}

export interface MetaTagMismatchScanStats {
    /** 扫描到的明文音频数 */
    fileCount: number
    /** 文件名可解析为「艺人 - 曲名」的数量 */
    parsedFilenameCount: number
    /** 与标签不一致的数量 */
    mismatchCount: number
    /** 标签读取失败或加密格式 */
    skippedCount: number
}

export interface ScanMetaTagMismatchParams {
    root: string
    pathFilterRules: PathFilterRule[]
}

export interface ScanMetaTagMismatchResult {
    root: string
    stats: MetaTagMismatchScanStats
    items: MetaTagMismatchItem[]
}

function normalizeMetaCompare(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function tagArtistFromCommon(common: Record<string, string>): string {
    return (common.artist || common.artists || '').trim()
}

function tagTitleFromCommon(common: Record<string, string>): string {
    return (common.title || '').trim()
}

function stringsEqual(a: string, b: string): boolean {
    if (!a && !b) return true
    if (!a || !b) return false
    return normalizeMetaCompare(a) === normalizeMetaCompare(b)
}

/** 艺人内容是否一致（忽略分隔符写法差异） */
export function artistTagMatchesFilename(
    filenameArtist: string,
    tagArtist: string
): boolean {
    return fileAndTagArtistsMatch(filenameArtist, tagArtist)
}

export const META_TAG_MISMATCH_ISSUE_LABELS: Record<MetaTagMismatchIssue, string> =
    {
        artistContent: '艺人内容',
        titleContent: '曲名',
        fileArtistSep: '文件名分隔',
        tagArtistSep: '标签分隔',
        fileNameTrailingUnderscore: '尾下划线'
    }

export function issuesToReasons(
    issues: MetaTagMismatchIssue[]
): MetaTagMismatchReason[] {
    const artist =
        issues.includes('artistContent') ||
        issues.includes('fileArtistSep') ||
        issues.includes('tagArtistSep')
    const title = issues.includes('titleContent')
    if (artist && title) return ['both']
    if (artist) return ['artist']
    if (title) return ['title']
    return []
}

function buildIssues(params: {
    artistContentMismatch: boolean
    titleMismatch: boolean
    fileArtistSep: boolean
    tagArtistSep: boolean
    fileNameTrailingUnderscore: boolean
}): MetaTagMismatchIssue[] {
    const out: MetaTagMismatchIssue[] = []
    if (params.artistContentMismatch) out.push('artistContent')
    if (params.titleMismatch) out.push('titleContent')
    if (params.fileArtistSep) out.push('fileArtistSep')
    if (params.tagArtistSep) out.push('tagArtistSep')
    if (params.fileNameTrailingUnderscore) out.push('fileNameTrailingUnderscore')
    return out
}

/**
 * 判断单文件是否需要文件名与标签对齐处理。
 * 文件名须可解析为「艺人 - 曲名」；艺人/曲名内容不一致，或分隔符不符合规范时返回条目。
 */
export function analyzeMetaTagMismatch(
    filePath: string,
    meta: AudioFileMetaInfo
): Omit<MetaTagMismatchItem, 'relativePath' | 'fileName' | 'fullPath'> | null {
    const parsed = parseArtistTitleFromFilePath(filePath)
    if (!parsed.split) return null

    const tagArtist = tagArtistFromCommon(meta.common)
    const tagTitle = tagTitleFromCommon(meta.common)

    const artistContentMismatch = !fileAndTagArtistsMatch(
        parsed.artist,
        tagArtist
    )
    const titleMismatch = !stringsEqual(parsed.title, tagTitle)
    const fileArtistSep = fileArtistHasSeparatorIssues(parsed.artist)
    const tagArtistSep = tagArtistHasSeparatorIssues(tagArtist)
    const fileNameTrailingUnderscore = filenameStemHasTrailingUnderscore(filePath)

    const issues = buildIssues({
        artistContentMismatch,
        titleMismatch,
        fileArtistSep,
        tagArtistSep,
        fileNameTrailingUnderscore
    })
    if (issues.length === 0) return null

    const resolved = path.resolve(filePath)

    return {
        fileArtist: parsed.artist,
        fileTitle: parsed.title,
        tagArtist,
        tagTitle,
        issues,
        reasons: issuesToReasons(issues),
        targetTagArtist: tagArtistFromFilenameArtist(parsed.artist),
        editable: isEditableAudioMetaPath(resolved)
    }
}

export function countItemsByIssue(
    items: MetaTagMismatchItem[],
    issue: MetaTagMismatchIssue
): number {
    return items.filter((item) => item.issues.includes(issue)).length
}

export {
    tagArtistFromFilenameArtist,
    tagArtistForMetaFromFilename,
    normalizeFilenameArtist
} from './artistSeparatorRules'
