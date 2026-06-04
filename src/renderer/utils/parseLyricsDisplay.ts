/** 网易云歌词行内片段（作词/作曲/编曲等元数据） */
export interface NeteaseLyricChunk {
    text: string
    imageUrl?: string
    artistId?: string
}

export interface LyricTextSegment {
    kind: 'time' | 'text'
    value: string
}

export type ParsedLyricsLine =
    | { kind: 'meta'; chunks: NeteaseLyricChunk[] }
    | { kind: 'tag'; label: string; value: string }
    | { kind: 'text'; segments: LyricTextSegment[] }

const LRC_TIME_PREFIX_RE = /^\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]\s*/
const LRC_TIME_TAG_RE = /^\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/
const LRC_META_TAG_RE = /^\[([a-zA-Z]+):([^\]]*)\]$/

/** 常见 LRC 文件头标签 → 展示标签 */
const LRC_TAG_LABELS: Record<string, string> = {
    ti: '标题',
    ar: '歌手',
    al: '专辑',
    by: '制作者',
    offset: '偏移',
    au: '作者',
    length: '时长',
    re: '编辑',
    ve: '版本',
    la: '语言',
    tool: '工具'
}

function extractArtistId(orpheusUrl: string): string | undefined {
    const match = orpheusUrl.match(/[?&]id=(\d+)/)
    return match?.[1]
}

function tryParseNeteaseMetaLine(line: string): ParsedLyricsLine | null {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) {
        return null
    }

    let jsonText = trimmed
    if (LRC_TIME_PREFIX_RE.test(trimmed)) {
        jsonText = trimmed.replace(LRC_TIME_PREFIX_RE, '')
    }
    if (!jsonText.startsWith('{')) {
        return null
    }

    let parsed: unknown
    try {
        parsed = JSON.parse(jsonText)
    } catch {
        return null
    }

    if (!parsed || typeof parsed !== 'object') {
        return null
    }

    const { t, c } = parsed as { t?: unknown; c?: unknown }
    if (typeof t !== 'number' || !Array.isArray(c)) {
        return null
    }

    const chunks: NeteaseLyricChunk[] = []
    for (const item of c) {
        if (!item || typeof item !== 'object') {
            continue
        }
        const { tx, li, or } = item as { tx?: unknown; li?: unknown; or?: unknown }
        const text = typeof tx === 'string' ? tx : ''
        const imageUrl = typeof li === 'string' && li.trim() ? li.trim() : undefined
        const artistId =
            typeof or === 'string' && or.trim()
                ? extractArtistId(or.trim())
                : undefined
        if (!text && !imageUrl) {
            continue
        }
        chunks.push({ text, imageUrl, artistId })
    }

    if (chunks.length === 0) {
        return null
    }

    return { kind: 'meta', chunks }
}

function tryParseLrcMetaTag(line: string): ParsedLyricsLine | null | 'skip' {
    const trimmed = line.trim()
    const match = trimmed.match(LRC_META_TAG_RE)
    if (!match) {
        return null
    }

    const key = match[1].toLowerCase()
    const value = match[2].trim()
    if (!value || (key === 'offset' && value === '0')) {
        return 'skip'
    }

    const label = LRC_TAG_LABELS[key] ?? key.toUpperCase()
    const displayValue = key === 'offset' ? `${value} ms` : value
    return { kind: 'tag', label, value: displayValue }
}

function parseTextLine(line: string): ParsedLyricsLine {
    const segments: LyricTextSegment[] = []
    let pos = 0

    while (pos < line.length) {
        const rest = line.slice(pos)
        const match = rest.match(LRC_TIME_TAG_RE)
        if (match) {
            segments.push({ kind: 'time', value: match[0] })
            pos += match[0].length
            continue
        }
        break
    }

    if (segments.length > 0) {
        const text = line.slice(pos)
        if (text.length > 0) {
            segments.push({ kind: 'text', value: text })
        }
        return { kind: 'text', segments }
    }

    return { kind: 'text', segments: [{ kind: 'text', value: line }] }
}

/** 将歌词原文解析为可展示行；无法识别的行原样保留 */
export function parseLyricsForDisplay(raw: string): ParsedLyricsLine[] {
    const lines = raw.split(/\r?\n/)
    const result: ParsedLyricsLine[] = []

    for (const line of lines) {
        const neteaseMeta = tryParseNeteaseMetaLine(line)
        if (neteaseMeta) {
            result.push(neteaseMeta)
            continue
        }
        const lrcTag = tryParseLrcMetaTag(line)
        if (lrcTag === 'skip') {
            continue
        }
        if (lrcTag) {
            result.push(lrcTag)
            continue
        }
        result.push(parseTextLine(line))
    }

    return result
}

/** 元数据行拼接为单行纯文本（无头像） */
export function formatNeteaseMetaLine(chunks: NeteaseLyricChunk[]): string {
    return chunks.map((chunk) => chunk.text).join('')
}
