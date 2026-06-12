import path from 'path'
import {
    artistHasNonRedundantUnderscoreSeparator,
    artistHasRedundantUnderscoreTokens,
    fileAndTagArtistsMatch,
    fileArtistHasSeparatorIssues,
    tagArtistFromFilenameArtist,
    tagArtistHasSeparatorIssues
} from './artistSeparatorRules'
import {
    nativeArtistTitleFromMeta,
    metaHasId3v1NativeTags,
    type AudioFileMetaInfo
} from './audioFileMeta'
import { detectDuplicateExtendedNativeTags } from './audioMetaExtraEdit'
import {
    isEditableAudioMetaPath,
    filenameStemHasTrailingUnderscore,
    fieldHasEdgeUnderscore,
    parseArtistTitleFromFilePath
} from './audioMetaEdit'
import type { PathFilterRule } from './pathFilters'
import type { BatchJobParams } from './batchCancel'
import {
    extendedNativeTagsHaveTraditionalChinese,
    filenameFieldsHaveTraditionalChinese
} from './traditionalChinese'

/** @deprecated 保留兼容；请用 issues */
export type MetaTagMismatchReason = 'artist' | 'title' | 'both'

export type MetaTagMismatchIssue =
    | 'artistContent'
    | 'titleContent'
    | 'extArtistContent'
    | 'extTitleContent'
    | 'fileArtistUnderscoreDup'
    | 'fileArtistUnderscoreSep'
    | 'fileArtistSep'
    | 'tagArtistUnderscoreDup'
    | 'tagArtistUnderscoreSep'
    | 'tagArtistSep'
    | 'fileUnderscore'
    | 'tagUnderscore'
    | 'extTagDuplicate'
    | 'extTagTraditional'
    | 'fileTraditional'
    | 'id3v1Tag'

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
    /** 是否可写入标签（mp3 / flac / ogg / m4a 等） */
    editable: boolean
    /** 扩展原生层重复的标签键（如 ARTIST、ALBUM） */
    extDuplicateKeys: string[]
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
        fileArtistUnderscoreDup: '作者 _ 重复',
        fileArtistUnderscoreSep: '作者 _ 分隔',
        fileArtistSep: '文件名分隔',
        tagArtistUnderscoreDup: '作者 _ 重复',
        tagArtistUnderscoreSep: '作者 _ 分隔',
        tagArtistSep: '标签分隔',
        fileUnderscore: '文件名下划线',
        tagUnderscore: '标签下划线',
        extTagDuplicate: '扩展重复',
        extTagTraditional: '扩展繁体',
        fileTraditional: '文件名繁体',
        id3v1Tag: 'ID3v1 标签'
    }

export function issuesToReasons(
    issues: MetaTagMismatchIssue[]
): MetaTagMismatchReason[] {
    const artist =
        issues.includes('artistContent') ||
        issues.includes('extArtistContent') ||
        issues.includes('fileArtistUnderscoreDup') ||
        issues.includes('fileArtistUnderscoreSep') ||
        issues.includes('fileArtistSep') ||
        issues.includes('tagArtistUnderscoreDup') ||
        issues.includes('tagArtistUnderscoreSep') ||
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
    fileArtistUnderscoreDup: boolean
    fileArtistUnderscoreSep: boolean
    fileArtistSep: boolean
    tagArtistUnderscoreDup: boolean
    tagArtistUnderscoreSep: boolean
    tagArtistSep: boolean
    fileUnderscore: boolean
    tagUnderscore: boolean
    extTagDuplicate: boolean
    extTagTraditional: boolean
    fileTraditional: boolean
    id3v1Tag: boolean
}): MetaTagMismatchIssue[] {
    const out: MetaTagMismatchIssue[] = []
    if (params.artistContentMismatch) out.push('artistContent')
    if (params.extArtistContentMismatch) out.push('extArtistContent')
    if (params.titleMismatch) out.push('titleContent')
    if (params.extTitleContentMismatch) out.push('extTitleContent')
    if (params.fileArtistUnderscoreDup) out.push('fileArtistUnderscoreDup')
    if (params.fileArtistUnderscoreSep) out.push('fileArtistUnderscoreSep')
    if (params.fileArtistSep) out.push('fileArtistSep')
    if (params.tagArtistUnderscoreDup) out.push('tagArtistUnderscoreDup')
    if (params.tagArtistUnderscoreSep) out.push('tagArtistUnderscoreSep')
    if (params.tagArtistSep) out.push('tagArtistSep')
    if (params.fileUnderscore) out.push('fileUnderscore')
    if (params.tagUnderscore) out.push('tagUnderscore')
    if (params.extTagDuplicate) out.push('extTagDuplicate')
    if (params.extTagTraditional) out.push('extTagTraditional')
    if (params.fileTraditional) out.push('fileTraditional')
    if (params.id3v1Tag) out.push('id3v1Tag')
    return out
}

/**
 * 判断单文件是否需要文件名与标签对齐处理。
 * 文件名须可解析为「艺人 - 曲名」，或 MP3 带有 ID3v1 标签待清理。
 */
export function analyzeMetaTagMismatch(
    filePath: string,
    meta: AudioFileMetaInfo
): Omit<MetaTagMismatchItem, 'relativePath' | 'fileName' | 'fullPath'> | null {
    const parsed = parseArtistTitleFromFilePath(filePath)
    const id3v1Tag = metaHasId3v1NativeTags(meta, filePath)

    if (!parsed.split) {
        if (!id3v1Tag) return null

        const tagArtist = tagArtistFromCommon(meta.common)
        const tagTitle = tagTitleFromCommon(meta.common)
        const { artist: extTagArtist, title: extTagTitle } =
            nativeArtistTitleFromMeta(meta)
        const resolved = path.resolve(filePath)

        return {
            fileArtist: '',
            fileTitle: '',
            tagArtist,
            tagTitle,
            extTagArtist,
            extTagTitle,
            extArtistMismatchFilename: false,
            extTitleMismatchFilename: false,
            issues: ['id3v1Tag'],
            reasons: [],
            targetTagArtist: null,
            editable: isEditableAudioMetaPath(resolved),
            extDuplicateKeys: []
        }
    }

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

    const fileArtistUnderscoreDup = artistHasRedundantUnderscoreTokens(parsed.artist)
    const fileArtistUnderscoreSep =
        !fileArtistUnderscoreDup &&
        artistHasNonRedundantUnderscoreSeparator(parsed.artist)
    const fileArtistSep =
        !fileArtistUnderscoreSep &&
        !fileArtistUnderscoreDup &&
        fileArtistHasSeparatorIssues(parsed.artist)
    const tagArtistUnderscoreDup =
        artistHasRedundantUnderscoreTokens(tagArtist) ||
        Boolean(
            extTagArtist && artistHasRedundantUnderscoreTokens(extTagArtist)
        )
    const tagArtistUnderscoreSep =
        !tagArtistUnderscoreDup &&
        (artistHasNonRedundantUnderscoreSeparator(tagArtist) ||
            Boolean(
                extTagArtist &&
                    artistHasNonRedundantUnderscoreSeparator(extTagArtist)
            ))
    const tagArtistSep =
        !tagArtistUnderscoreSep &&
        (tagArtistHasSeparatorIssues(tagArtist) ||
            Boolean(extTagArtist && tagArtistHasSeparatorIssues(extTagArtist)))
    const fileUnderscore =
        filenameStemHasTrailingUnderscore(filePath) ||
        fieldHasEdgeUnderscore(parsed.title) ||
        fieldHasEdgeUnderscore(parsed.artist)
    const tagUnderscore =
        fieldHasEdgeUnderscore(tagTitle) ||
        fieldHasEdgeUnderscore(tagArtist) ||
        Boolean(extTagTitle && fieldHasEdgeUnderscore(extTagTitle)) ||
        Boolean(extTagArtist && fieldHasEdgeUnderscore(extTagArtist))

    const { hasDuplicate: extTagDuplicate, duplicateKeys: extDuplicateKeys } =
        detectDuplicateExtendedNativeTags(meta, filePath)

    const extTagTraditional = extendedNativeTagsHaveTraditionalChinese(
        meta,
        filePath
    )
    const fileTraditional = filenameFieldsHaveTraditionalChinese(
        parsed.artist,
        parsed.title
    )

    const issues = buildIssues({
        artistContentMismatch: tagArtistContentMismatch,
        extArtistContentMismatch,
        titleMismatch: tagTitleMismatch,
        extTitleContentMismatch,
        fileArtistUnderscoreDup,
        fileArtistUnderscoreSep,
        fileArtistSep,
        tagArtistUnderscoreDup,
        tagArtistUnderscoreSep,
        tagArtistSep,
        fileUnderscore,
        tagUnderscore,
        extTagDuplicate,
        extTagTraditional,
        fileTraditional,
        id3v1Tag
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
        editable: isEditableAudioMetaPath(resolved),
        extDuplicateKeys
    }
}

export function countItemsByIssue(
    items: MetaTagMismatchItem[],
    issue: MetaTagMismatchIssue
): number {
    return items.filter((item) => item.issues.includes(issue)).length
}

export {
    artistHasNonRedundantUnderscoreSeparator,
    artistHasRedundantUnderscoreTokens,
    artistHasUnderscoreSeparator,
    tagArtistFromFilenameArtist,
    tagArtistForMetaFromFilename,
    normalizeFilenameArtist,
    normalizeFilenameArtistFromUnderscore,
    normalizeTagArtistFromUnderscore,
    dedupeUnderscoreArtistsForFilename,
    dedupeUnderscoreArtistsForTag
} from './artistSeparatorRules'
