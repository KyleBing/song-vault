import OpenCC from 'opencc-js'

let converter: ((text: string) => string) | null = null

function getConverter(): (text: string) => string {
    if (!converter) {
        converter = OpenCC.Converter({ from: 'tw', to: 'cn' })
    }
    return converter
}

/** OpenCC 繁体 → 简体（台湾字形 → 大陆简体） */
export function toSimplifiedChinese(text: string): string {
    if (!text) return text
    return getConverter()(text)
}

export function textChangesWhenSimplified(text: string): boolean {
    if (!text) return false
    const converted = toSimplifiedChinese(text)
    return converted !== text
}
