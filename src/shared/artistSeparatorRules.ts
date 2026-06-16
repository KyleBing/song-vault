/** 作者名中作多艺人分隔的下划线（两侧须各有 1～2 个空格；无空格则视为单人名） */
const UNDERSCORE_ARTIST_SEPARATOR = / {1,2}_ {1,2}/

function normalizeArtistToken(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** 作者项是否为紧挨 _ 的点号编码（如 G_E_M_），标签侧逐字对应为 . */
export function artistTokenHasInlineUnderscore(token: string): boolean {
    const trimmed = token.trim()
    if (!trimmed.includes('_')) return false
    return !artistHasUnderscoreSeparator(trimmed)
}

/** 文件名侧紧挨 _ 的单人名转为标签写法（每个 _ 对应一个 .，如 G_E_M_ → G.E.M.） */
export function convertFilenameInlineUnderscoreToTag(token: string): string {
    const trimmed = token.trim()
    if (!artistTokenHasInlineUnderscore(trimmed)) return trimmed
    return trimmed.replace(/_/g, '.')
}

/** 文件名作者项与标签作者项是否一致（含紧挨 _ ↔ 点号等价） */
function artistPartTokensMatch(filePart: string, tagPart: string): boolean {
    if (artistTokenHasInlineUnderscore(filePart)) {
        const expectedTag = convertFilenameInlineUnderscoreToTag(filePart)
        return normalizeArtistToken(tagPart) === normalizeArtistToken(expectedTag)
    }
    return normalizeArtistToken(filePart) === normalizeArtistToken(tagPart)
}

/** 艺人名中间含带空格的 _，表示误用下划线分隔多艺人（紧挨的 _ 算单人名；首尾 _ 由「下划线」规则处理） */
export function artistHasUnderscoreSeparator(artist: string): boolean {
    const trimmed = artist.trim()
    if (!trimmed.includes('_')) return false
    const inner = trimmed.replace(/^_+/, '').replace(/_+$/, '')
    return UNDERSCORE_ARTIST_SEPARATOR.test(inner)
}

/** 按下划线解析多艺人名单（仅 _ 两侧各有 1～2 个空格时分隔） */
export function parseUnderscoreArtistNames(artist: string): string[] {
    const trimmed = artist.trim()
    if (!trimmed) return []
    return trimmed
        .split(UNDERSCORE_ARTIST_SEPARATOR)
        .map((p) => p.trim())
        .filter(Boolean)
}

/** 先按顶层分隔符（& / , / ;）拆成作者项，再处理项内的 _ */
export function parseTopLevelArtistTokens(artist: string): string[] {
    const trimmed = artist.trim()
    if (!trimmed) return []
    if (trimmed.includes(' & ')) {
        return trimmed.split(' & ').map((p) => p.trim()).filter(Boolean)
    }
    if (trimmed.includes(',')) {
        return trimmed.split(',').map((p) => p.trim()).filter(Boolean)
    }
    if (trimmed.includes(';')) {
        return trimmed
            .split(/\s*;\s*/)
            .map((p) => p.trim())
            .filter(Boolean)
    }
    if (trimmed.includes('&')) {
        return trimmed.split(/\s*&\s*/).map((p) => p.trim()).filter(Boolean)
    }
    // 整段仅含带空格的 _ 分隔时保留为一项（如「李雨霏 _ 晚饭」），由项内逻辑解析
    if (artistHasUnderscoreSeparator(trimmed)) {
        return [trimmed]
    }
    return [trimmed]
}

/** 展开单个作者项为作者名单（保留原文大小写） */
function expandArtistTokenPartsRaw(token: string): string[] {
    const trimmed = token.trim()
    if (!trimmed) return []
    if (artistHasUnderscoreSeparator(trimmed)) {
        return parseUnderscoreArtistNames(trimmed)
    }
    if (trimmed.includes(' & ')) {
        return trimmed.split(' & ').map((p) => p.trim()).filter(Boolean)
    }
    if (trimmed.includes(',')) {
        return trimmed.split(',').map((p) => p.trim()).filter(Boolean)
    }
    if (trimmed.includes(';')) {
        return trimmed
            .split(/\s*;\s*/)
            .map((p) => p.trim())
            .filter(Boolean)
    }
    if (trimmed.includes('&')) {
        return trimmed.split(/\s*&\s*/).map((p) => p.trim()).filter(Boolean)
    }
    return [trimmed]
}

/** 展开单个作者项为规范化的作者名单（用于比较） */
function expandArtistTokenParts(token: string): string[] {
    return expandArtistTokenPartsRaw(token).map(normalizeArtistToken)
}

/** 带 _ 的作者项是否已被同字段内其它写法（& / , 或单独列出）覆盖 */
export function isRedundantUnderscoreArtistToken(
    underscoreToken: string,
    allTokens: string[]
): boolean {
    if (!artistHasUnderscoreSeparator(underscoreToken)) return false
    const parts = parseUnderscoreArtistNames(underscoreToken).map(normalizeArtistToken)
    if (parts.length < 2) return false

    const otherParts: string[] = []
    for (const token of allTokens) {
        if (token === underscoreToken) continue
        otherParts.push(...expandArtistTokenParts(token))
    }
    const otherSet = new Set(otherParts)
    return parts.every((part) => otherSet.has(part))
}

/** 同字段内是否同时存在 _ 写法与 & / 单独列出的重复作者 */
export function artistHasRedundantUnderscoreTokens(artist: string): boolean {
    const tokens = parseTopLevelArtistTokens(artist)
    if (tokens.length <= 1) return false
    return tokens.some((token) => isRedundantUnderscoreArtistToken(token, tokens))
}

/** 去掉已被 & / 写法覆盖的 _ 作者项 */
export function removeRedundantUnderscoreArtistTokens(tokens: string[]): string[] {
    return tokens.filter(
        (token) => !isRedundantUnderscoreArtistToken(token, tokens)
    )
}

/** 字段内是否仍有需转换（非重复）的 _ 分隔作者项 */
export function artistHasNonRedundantUnderscoreSeparator(artist: string): boolean {
    const tokens = parseTopLevelArtistTokens(artist)
    return tokens.some(
        (token) =>
            artistHasUnderscoreSeparator(token) &&
            !isRedundantUnderscoreArtistToken(token, tokens)
    )
}

/** 去掉重复 _ 作者项后，按文件名规范拼接（逗号无空格） */
export function dedupeUnderscoreArtistsForFilename(artist: string): string {
    const tokens = removeRedundantUnderscoreArtistTokens(
        parseTopLevelArtistTokens(artist)
    )
    if (tokens.length === 0) return ''
    return tokens.join(',')
}

/** 去掉重复 _ 作者项后，按标签规范拼接（ & ） */
export function dedupeUnderscoreArtistsForTag(artist: string): string {
    const tokens = removeRedundantUnderscoreArtistTokens(
        parseTopLevelArtistTokens(artist)
    )
    if (tokens.length === 0) return ''
    if (tokens.length === 1) return tokens[0]
    return tokens.join(' & ')
}

/** 文件名多艺人：逗号连接、逗号两侧无空格；不得含 ; & */
export function fileArtistHasSeparatorIssues(artist: string): boolean {
    const trimmed = artist.trim()
    if (!trimmed) return false
    if (/[;&]/.test(trimmed)) return true
    if (/,\s|\s,/.test(trimmed)) return true
    return false
}

/** 标签多艺人：应用 " & " 连接；不得用 , ; 或格式错误的 & */
export function tagArtistHasSeparatorIssues(artist: string): boolean {
    const trimmed = artist.trim()
    if (!trimmed) return false
    if (/[;,]/.test(trimmed)) return true
    if (trimmed.includes('&')) {
        const withoutProper = trimmed.replace(/ & /g, '')
        if (withoutProper.includes('&')) return true
    }
    return false
}

/** 将单个含 _ 的作者项规范为逗号连接 */
function normalizeFilenameUnderscoreToken(token: string): string {
    const parts = parseUnderscoreArtistNames(token)
    if (parts.length === 0) return ''
    return parts.join(',')
}

/** 将单个含 _ 的作者项规范为 & 连接 */
function normalizeTagUnderscoreToken(token: string): string {
    const parts = parseUnderscoreArtistNames(token)
    if (parts.length === 0) return ''
    if (parts.length === 1) return parts[0]
    return parts.join(' & ')
}

/** 按顺序去重作者名（保留原文大小写） */
function dedupeArtistPartsOrdered(parts: string[]): string[] {
    const seen = new Set<string>()
    const out: string[] = []
    for (const part of parts) {
        const trimmed = part.trim()
        if (!trimmed) continue
        const key = normalizeArtistToken(trimmed)
        if (seen.has(key)) continue
        seen.add(key)
        out.push(trimmed)
    }
    return out
}

/** 展开 token 列表为去重后的作者名（用于 _ 分隔修正后合并） */
function flattenTokensToUniqueArtists(tokens: string[]): string[] {
    const parts: string[] = []
    for (const token of tokens) {
        parts.push(...expandArtistTokenPartsRaw(token))
    }
    return dedupeArtistPartsOrdered(parts)
}

/**
 * 修正 _ 分隔：为每个 _ 项添加规范写法（& / 逗号），删除原 _ 项，再去重合并。
 */
function replaceUnderscoreTokensAndMerge(
    artist: string,
    joiner: ',' | ' & '
): string {
    const tokens = parseTopLevelArtistTokens(artist)
    const merged: string[] = []

    for (const token of tokens) {
        if (artistHasUnderscoreSeparator(token)) {
            merged.push(
                joiner === ','
                    ? normalizeFilenameUnderscoreToken(token)
                    : normalizeTagUnderscoreToken(token)
            )
        } else {
            merged.push(token.trim())
        }
    }

    const parts = flattenTokensToUniqueArtists(merged)
    if (parts.length === 0) return ''
    if (parts.length === 1) return parts[0]
    return parts.join(joiner)
}

/** 将含带空格 _ 分隔的文件名艺人规范为逗号连接（A _ B → A,B；混用时先加规范项再去 _） */
export function normalizeFilenameArtistFromUnderscore(fileArtist: string): string {
    return replaceUnderscoreTokensAndMerge(fileArtist, ',')
}

/** 将含带空格 _ 分隔的标签艺人规范为 & 连接（A _ B → A & B；混用时先加 & 项再去 _） */
export function normalizeTagArtistFromUnderscore(tagArtist: string): string {
    return replaceUnderscoreTokensAndMerge(tagArtist, ' & ')
}

/** 解析艺人名单（兼容 ; & , _ 等混用分隔符） */
export function parseMixedArtistNames(artist: string): string[] {
    const tokens = parseTopLevelArtistTokens(artist)
    const out: string[] = []
    for (const token of tokens) {
        out.push(...expandArtistTokenPartsRaw(token))
    }
    return out.filter(Boolean)
}

/** 将文件名艺人规范为逗号连接、无空格（A,B） */
export function normalizeFilenameArtist(fileArtist: string): string {
    const parts = parseMixedArtistNames(fileArtist)
    if (parts.length === 0) return ''
    return parts.join(',')
}

/** 写入标签时用的艺人（先解析混用分隔符，再转为 & 连接；紧挨 _ 转为点号） */
export function tagArtistForMetaFromFilename(fileArtist: string): string {
    const parts = parseMixedArtistNames(fileArtist).map(
        convertFilenameInlineUnderscoreToTag
    )
    if (parts.length === 0) return ''
    if (parts.length === 1) return parts[0]
    return parts.join(' & ')
}

/** 将文件名中的艺人转为标签写法（A,B → A & B；G_E_M → G.E.M.）；文件名格式非法时返回 null */
export function tagArtistFromFilenameArtist(fileArtist: string): string | null {
    const trimmed = fileArtist.trim()
    if (!trimmed) return ''
    if (fileArtistHasSeparatorIssues(trimmed)) return null
    if (artistHasNonRedundantUnderscoreSeparator(trimmed)) return null
    const parts = trimmed
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
        .map(convertFilenameInlineUnderscoreToTag)
    if (parts.length <= 1) return parts[0] ?? ''
    return parts.join(' & ')
}

/** 解析文件名侧艺人列表（逗号或 _ 分隔，含顶层混用） */
export function parseFileArtistNames(artist: string): string[] {
    if (!artist.trim()) return []
    const tokens = parseTopLevelArtistTokens(artist)
    const out: string[] = []
    for (const token of tokens) {
        out.push(...expandArtistTokenPartsRaw(token))
    }
    return out.filter(Boolean)
}

/** 解析标签侧艺人列表（ & / ; / , / _ 等，含顶层混用） */
export function parseTagArtistNames(artist: string): string[] {
    if (!artist.trim()) return []
    const tokens = parseTopLevelArtistTokens(artist)
    const out: string[] = []
    for (const token of tokens) {
        out.push(...expandArtistTokenPartsRaw(token))
    }
    return out.filter(Boolean)
}

/** 比较文件名与标签的艺人名单是否一致（忽略分隔符写法；紧挨 _ 与点号写法等价） */
export function fileAndTagArtistsMatch(
    filenameArtist: string,
    tagArtist: string
): boolean {
    const fn = normalizeArtistToken(filenameArtist)
    if (!fn) return true
    const tag = normalizeArtistToken(tagArtist)
    if (!tag) return false

    const fileRawParts = parseFileArtistNames(filenameArtist)
    const tagRawParts = parseTagArtistNames(tagArtist)

    if (fileRawParts.length !== tagRawParts.length) return false
    if (fileRawParts.length === 0) return fn === tag
    return fileRawParts.every((part, i) =>
        artistPartTokensMatch(part, tagRawParts[i])
    )
}
