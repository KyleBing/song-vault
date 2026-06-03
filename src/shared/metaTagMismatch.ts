import path from 'path'
import { splitMetaDisplayValues, type AudioFileMetaInfo } from './audioFileMeta'
import {
    isEditableAudioMetaPath,
    parseArtistTitleFromFilePath
} from './audioMetaEdit'
import type { PathFilterRule } from './pathFilters'

export type MetaTagMismatchReason = 'artist' | 'title' | 'both'

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
    reasons: MetaTagMismatchReason[]
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

/** 艺人是否一致（支持标签内多艺人「;」分隔） */
export function artistTagMatchesFilename(
    filenameArtist: string,
    tagArtist: string
): boolean {
    const fn = normalizeMetaCompare(filenameArtist)
    if (!fn) return true
    const tag = normalizeMetaCompare(tagArtist)
    if (!tag) return false

    if (fn === tag) return true

    const parts = splitMetaDisplayValues(tagArtist).map(normalizeMetaCompare)
    return parts.some((part) => part === fn)
}

function buildReasons(
    artistMismatch: boolean,
    titleMismatch: boolean
): MetaTagMismatchReason[] {
    if (artistMismatch && titleMismatch) return ['both']
    if (artistMismatch) return ['artist']
    return ['title']
}

/**
 * 判断单文件是否为「文件名艺人/曲名」与内嵌标签不一致。
 * 仅当文件名可解析为「艺人 - 曲名」且至少一项与标签不同时返回条目。
 */
export function analyzeMetaTagMismatch(
    filePath: string,
    meta: AudioFileMetaInfo
): Omit<MetaTagMismatchItem, 'relativePath' | 'fileName' | 'fullPath'> | null {
    const parsed = parseArtistTitleFromFilePath(filePath)
    if (!parsed.split) return null

    const tagArtist = tagArtistFromCommon(meta.common)
    const tagTitle = tagTitleFromCommon(meta.common)

    const artistMismatch = !artistTagMatchesFilename(parsed.artist, tagArtist)
    const titleMismatch = !stringsEqual(parsed.title, tagTitle)

    if (!artistMismatch && !titleMismatch) return null

    const resolved = path.resolve(filePath)

    return {
        fileArtist: parsed.artist,
        fileTitle: parsed.title,
        tagArtist,
        tagTitle,
        reasons: buildReasons(artistMismatch, titleMismatch),
        editable: isEditableAudioMetaPath(resolved)
    }
}
