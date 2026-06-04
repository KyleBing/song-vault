import { TRADITIONAL_VARIANT_CHARS } from './traditionalChineseChars.generated'

const TRADITIONAL_VARIANT_SET = new Set(TRADITIONAL_VARIANT_CHARS.split(''))

/** 文本是否含繁体字形（OpenCC 简繁对照表的繁体侧，已排除简体键字形） */
export function containsTraditionalChinese(text: string): boolean {
    if (!text) return false
    for (const ch of text) {
        if (TRADITIONAL_VARIANT_SET.has(ch)) return true
    }
    return false
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
