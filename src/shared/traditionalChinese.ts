import { TRADITIONAL_VARIANT_CHARS } from './traditionalChineseChars.generated'
import type { AudioFileMetaInfo } from './audioFileMeta'
import { buildExtendedNativeEditRows } from './audioMetaExtraEdit'

const TRADITIONAL_VARIANT_SET = new Set(TRADITIONAL_VARIANT_CHARS.split(''))

/** 单字是否为 OpenCC 繁体侧字形 */
export function isTraditionalVariantChar(ch: string): boolean {
    return TRADITIONAL_VARIANT_SET.has(ch)
}

/** 文本是否含繁体字形（OpenCC 简繁对照表的繁体侧，已排除简体键字形） */
export function containsTraditionalChinese(text: string): boolean {
    if (!text) return false
    for (const ch of text) {
        if (isTraditionalVariantChar(ch)) return true
    }
    return false
}

/** 文件名解析出的艺人 / 曲名是否含繁体字 */
export function filenameFieldsHaveTraditionalChinese(
    fileArtist: string,
    fileTitle: string
): boolean {
    return (
        containsTraditionalChinese(fileArtist) ||
        containsTraditionalChinese(fileTitle)
    )
}

/** 扩展 / Vorbis / ID3 原生标签（扩展 Tab 全部字段）是否含繁体字 */
export function extendedNativeTagsHaveTraditionalChinese(
    meta: AudioFileMetaInfo,
    filePath: string
): boolean {
    return buildExtendedNativeEditRows(meta, filePath).some((row) =>
        containsTraditionalChinese(row.value)
    )
}

/** 内嵌标签艺人 / 曲名是否含繁体字（含 common 与扩展 / Vorbis 原生字段） */
export function metaTagFieldsHaveTraditionalChinese(
    tagArtist: string,
    tagTitle: string,
    extTagArtist = '',
    extTagTitle = ''
): boolean {
    return (
        containsTraditionalChinese(tagArtist) ||
        containsTraditionalChinese(tagTitle) ||
        containsTraditionalChinese(extTagArtist) ||
        containsTraditionalChinese(extTagTitle)
    )
}

/** 扫描行是否含繁体（文件名 + 常规标签 + 全部扩展字段） */
export function metaTagRowHasTraditionalChinese(
    row: {
        fileArtist: string
        fileTitle: string
        tagArtist: string
        tagTitle: string
        extTagArtist: string
        extTagTitle: string
        issues: readonly string[]
    }
): boolean {
    return (
        filenameFieldsHaveTraditionalChinese(row.fileArtist, row.fileTitle) ||
        metaTagFieldsHaveTraditionalChinese(
            row.tagArtist,
            row.tagTitle,
            row.extTagArtist,
            row.extTagTitle
        ) ||
        row.issues.includes('extTagTraditional') ||
        row.issues.includes('fileTraditional')
    )
}
