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

/** 解析艺人名单（兼容 ; & , 等混用分隔符） */
export function parseMixedArtistNames(artist: string): string[] {
    const trimmed = artist.trim()
    if (!trimmed) return []
    if (trimmed.includes(' & ')) {
        return trimmed.split(' & ').map((p) => p.trim()).filter(Boolean)
    }
    if (trimmed.includes(';')) {
        return trimmed
            .split(/\s*;\s*/)
            .map((p) => p.trim())
            .filter(Boolean)
    }
    if (trimmed.includes(',')) {
        return trimmed
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean)
    }
    if (trimmed.includes('&')) {
        return trimmed
            .split(/\s*&\s*/)
            .map((p) => p.trim())
            .filter(Boolean)
    }
    return [trimmed]
}

/** 将文件名艺人规范为逗号连接、无空格（A,B） */
export function normalizeFilenameArtist(fileArtist: string): string {
    const parts = parseMixedArtistNames(fileArtist)
    if (parts.length === 0) return ''
    return parts.join(',')
}

/** 写入标签时用的艺人（先解析混用分隔符，再转为 & 连接） */
export function tagArtistForMetaFromFilename(fileArtist: string): string {
    const parts = parseMixedArtistNames(fileArtist)
    if (parts.length === 0) return ''
    if (parts.length === 1) return parts[0]
    return parts.join(' & ')
}

/** 将文件名中的艺人转为标签写法（A,B → A & B）；文件名格式非法时返回 null */
export function tagArtistFromFilenameArtist(fileArtist: string): string | null {
    const trimmed = fileArtist.trim()
    if (!trimmed) return ''
    if (fileArtistHasSeparatorIssues(trimmed)) return null
    const parts = trimmed.split(',').map((p) => p.trim()).filter(Boolean)
    if (parts.length <= 1) return parts[0] ?? ''
    return parts.join(' & ')
}

/** 解析文件名侧艺人列表（逗号分隔） */
export function parseFileArtistNames(artist: string): string[] {
    if (!artist.trim()) return []
    return artist
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
}

/** 解析标签侧艺人列表（ & / ; / , 等） */
export function parseTagArtistNames(artist: string): string[] {
    const trimmed = artist.trim()
    if (!trimmed) return []
    if (trimmed.includes(' & ')) {
        return trimmed.split(' & ').map((p) => p.trim()).filter(Boolean)
    }
    if (trimmed.includes(';')) {
        return trimmed
            .split(/\s*;\s*/)
            .map((p) => p.trim())
            .filter(Boolean)
    }
    if (trimmed.includes(',')) {
        return trimmed
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean)
    }
    return [trimmed]
}

function normalizeArtistToken(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** 比较文件名与标签的艺人名单是否一致（忽略分隔符写法） */
export function fileAndTagArtistsMatch(
    filenameArtist: string,
    tagArtist: string
): boolean {
    const fn = normalizeArtistToken(filenameArtist)
    if (!fn) return true
    const tag = normalizeArtistToken(tagArtist)
    if (!tag) return false

    const fileParts = parseFileArtistNames(filenameArtist).map(normalizeArtistToken)
    const tagParts = parseTagArtistNames(tagArtist).map(normalizeArtistToken)

    if (fileParts.length > 1 || tagParts.length > 1) {
        if (fileParts.length !== tagParts.length) return false
        return fileParts.every((part, i) => part === tagParts[i])
    }

    if (fileParts.length === 1 && tagParts.length === 1) {
        return fileParts[0] === tagParts[0]
    }

    return fn === tag
}
