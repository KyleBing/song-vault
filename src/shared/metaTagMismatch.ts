import path from 'path'
import {
    fileAndTagArtistsMatch,
    fileArtistHasSeparatorIssues,
    tagArtistFromFilenameArtist,
    tagArtistHasSeparatorIssues
} from './artistSeparatorRules'
import {
    nativeArtistTitleFromMeta,
    type AudioFileMetaInfo
} from './audioFileMeta'
import {
    isEditableAudioMetaPath,
    filenameStemHasTrailingUnderscore,
    fieldHasEdgeUnderscore,
    parseArtistTitleFromFilePath
} from './audioMetaEdit'
import type { PathFilterRule } from './pathFilters'
import type { BatchJobParams } from './batchCancel'

/** @deprecated 保留兼容；请用 issues */
export type MetaTagMismatchReason = 'artist' | 'title' | 'both'

export type MetaTagMismatchIssue =
    | 'artistContent'
    | 'titleContent'
    | 'extArtistContent'
    | 'extTitleContent'
    | 'fileArtistSep'
    | 'tagArtistSep'
    | 'fileUnderscore'
    | 'tagUnderscore'

export interface MetaTagMismatchItem {
    relativePath: string
    fileName: string
    fullPath: string
    /** 从文件名解析 */
    fileArtist: string
    fileTitle: string
    /** 文件内标签（common 层） */
    tagArtist: string
    tagTitle: string
    /** Vorbis / ID3 原生标签中的艺人、标题 */
    extTagArtist: string
    extTagTitle: string
    /** 扩展艺人 / 曲名是否与文件名不一致（扫描时单独判定） */
    extArtistMismatchFilename: boolean
    extTitleMismatchFilename: boolean
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

export interface ScanMetaTagMismatchParams extends BatchJobParams {
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

/** 扩展 / Vorbis 原生艺人是否与文件名一致（空扩展视为不参与比较） */
export function extArtistMatchesFilename(
    filenameArtist: string,
    extTagArtist: string
): boolean {
    if (!extTagArtist.trim()) return true
    return fileAndTagArtistsMatch(filenameArtist, extTagArtist)
}

/** 扩展 / Vorbis 原生曲名是否与文件名一致（空扩展视为不参与比较） */
export function extTitleMatchesFilename(
    filenameTitle: string,
    extTagTitle: string
): boolean {
    if (!extTagTitle.trim()) return true
    return stringsEqual(filenameTitle, extTagTitle)
}

export const META_TAG_MISMATCH_ISSUE_LABELS: Record<MetaTagMismatchIssue, string> =
    {
        artistContent: '标签艺人',
        titleContent: '标签曲名',
        extArtistContent: '扩展艺人',
        extTitleContent: '扩展曲名',
        fileArtistSep: '文件名分隔',
        tagArtistSep: '标签分隔',
        fileUnderscore: '文件名下划线',
        tagUnderscore: '标签下划线'
    }

export function issuesToReasons(
    issues: MetaTagMismatchIssue[]
): MetaTagMismatchReason[] {
    const artist =
        issues.includes('artistContent') ||
        issues.includes('extArtistContent') ||
        issues.includes('fileArtistSep') ||
        issues.includes('tagArtistSep') ||
        issues.includes('fileUnderscore') ||
        issues.includes('tagUnderscore')
    const title =
        issues.includes('titleContent') ||
        issues.includes('extTitleContent') ||
        issues.includes('fileUnderscore') ||
        issues.includes('tagUnderscore')
    if (artist && title) return ['both']
    if (artist) return ['artist']
    if (title) return ['title']
    return []
}

function buildIssues(params: {
    artistContentMismatch: boolean
    extArtistContentMismatch: boolean
    titleMismatch: boolean
    extTitleContentMismatch: boolean
    fileArtistSep: boolean
    tagArtistSep: boolean
    fileUnderscore: boolean
    tagUnderscore: boolean
}): MetaTagMismatchIssue[] {
    const out: MetaTagMismatchIssue[] = []
    if (params.artistContentMismatch) out.push('artistContent')
    if (params.extArtistContentMismatch) out.push('extArtistContent')
    if (params.titleMismatch) out.push('titleContent')
    if (params.extTitleContentMismatch) out.push('extTitleContent')
    if (params.fileArtistSep) out.push('fileArtistSep')
    if (params.tagArtistSep) out.push('tagArtistSep')
    if (params.fileUnderscore) out.push('fileUnderscore')
    if (params.tagUnderscore) out.push('tagUnderscore')
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
    const { artist: extTagArtist, title: extTagTitle } =
        nativeArtistTitleFromMeta(meta)

    const tagArtistContentMismatch = !fileAndTagArtistsMatch(
        parsed.artist,
        tagArtist
    )
    const extArtistMismatchFilename = !extArtistMatchesFilename(
        parsed.artist,
        extTagArtist
    )
    const extArtistContentMismatch =
        Boolean(extTagArtist.trim()) && extArtistMismatchFilename
    const tagTitleMismatch = !stringsEqual(parsed.title, tagTitle)
    const extTitleMismatchFilename = !extTitleMatchesFilename(
        parsed.title,
        extTagTitle
    )
    const extTitleContentMismatch =
        Boolean(extTagTitle.trim()) && extTitleMismatchFilename

    const fileArtistSep = fileArtistHasSeparatorIssues(parsed.artist)
    const tagArtistSep =
        tagArtistHasSeparatorIssues(tagArtist) ||
        Boolean(extTagArtist && tagArtistHasSeparatorIssues(extTagArtist))
    const fileUnderscore =
        filenameStemHasTrailingUnderscore(filePath) ||
        fieldHasEdgeUnderscore(parsed.title) ||
        fieldHasEdgeUnderscore(parsed.artist)
    const tagUnderscore =
        fieldHasEdgeUnderscore(tagTitle) ||
        fieldHasEdgeUnderscore(tagArtist) ||
        Boolean(extTagTitle && fieldHasEdgeUnderscore(extTagTitle)) ||
        Boolean(extTagArtist && fieldHasEdgeUnderscore(extTagArtist))

    const issues = buildIssues({
        artistContentMismatch: tagArtistContentMismatch,
        extArtistContentMismatch,
        titleMismatch: tagTitleMismatch,
        extTitleContentMismatch,
        fileArtistSep,
        tagArtistSep,
        fileUnderscore,
        tagUnderscore
    })
    if (issues.length === 0) return null

    const resolved = path.resolve(filePath)

    return {
        fileArtist: parsed.artist,
        fileTitle: parsed.title,
        tagArtist,
        tagTitle,
        extTagArtist,
        extTagTitle,
        extArtistMismatchFilename,
        extTitleMismatchFilename,
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
