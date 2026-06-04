import { splitMetaDisplayValues, type AudioFileMetaInfo } from './audioFileMeta'
import { labelForCommonKey } from './audioMetaLabels'
import { isDecryptableExtension } from './musicFormats'
import { fileExtensionLower } from './pathLite'

/** 表单字段（字符串形式，便于绑定输入框） */
export interface AudioMetaEditForm {
    title: string
    artist: string
    album: string
    albumartist: string
    genre: string
    year: string
    date: string
    trackNo: string
    trackOf: string
    diskNo: string
    diskOf: string
    comment: string
    lyrics: string
    composer: string
    lyricist: string
    conductor: string
    remixer: string
    producer: string
    label: string
    grouping: string
    subtitle: string
    bpm: string
    catalognumber: string
}

export interface AudioMetaEditFieldDef {
    key: keyof AudioMetaEditForm
    label: string
    /** 多值字段，使用「; 」分隔 */
    multiValue?: boolean
    /** 多行文本 */
    multiline?: boolean
    /** 数字输入 */
    numeric?: boolean
}

/** 可写入 mp3/flac 的标签字段 */
export const AUDIO_META_EDIT_FIELDS: AudioMetaEditFieldDef[] = [
    { key: 'title', label: labelForCommonKey('title') },
    { key: 'artist', label: labelForCommonKey('artist'), multiValue: true },
    { key: 'album', label: labelForCommonKey('album') },
    { key: 'albumartist', label: labelForCommonKey('albumartist') },
    { key: 'genre', label: labelForCommonKey('genre'), multiValue: true },
    { key: 'year', label: labelForCommonKey('year'), numeric: true },
    { key: 'date', label: labelForCommonKey('date') },
    { key: 'trackNo', label: '曲目号', numeric: true },
    { key: 'trackOf', label: '曲目总数', numeric: true },
    { key: 'diskNo', label: '光盘号', numeric: true },
    { key: 'diskOf', label: '光盘总数', numeric: true },
    { key: 'comment', label: labelForCommonKey('comment'), multiline: true },
    { key: 'lyrics', label: labelForCommonKey('lyrics'), multiline: true },
    { key: 'composer', label: labelForCommonKey('composer'), multiValue: true },
    { key: 'lyricist', label: labelForCommonKey('lyricist'), multiValue: true },
    { key: 'conductor', label: labelForCommonKey('conductor'), multiValue: true },
    { key: 'remixer', label: labelForCommonKey('remixer'), multiValue: true },
    { key: 'producer', label: labelForCommonKey('producer'), multiValue: true },
    { key: 'label', label: labelForCommonKey('label'), multiValue: true },
    { key: 'grouping', label: labelForCommonKey('grouping') },
    { key: 'subtitle', label: labelForCommonKey('subtitle'), multiValue: true },
    { key: 'bpm', label: labelForCommonKey('bpm'), numeric: true },
    { key: 'catalognumber', label: labelForCommonKey('catalognumber'), multiValue: true }
]

export interface AudioMetaEditPayload {
    filePath: string
    form: AudioMetaEditForm
    /** undefined = 保留原封面；null = 移除封面；string = base64（不含 data URL 前缀） */
    coverBase64?: string | null
    coverMime?: string
}

export interface WriteAudioMetaResult {
    ok: boolean
    filePath: string
    message?: string
}

export interface PickCoverImageResult {
    ok: boolean
    /** data URL，便于预览 */
    dataUrl?: string
    base64?: string
    mime?: string
    message?: string
}

export function emptyAudioMetaEditForm(): AudioMetaEditForm {
    return {
        title: '',
        artist: '',
        album: '',
        albumartist: '',
        genre: '',
        year: '',
        date: '',
        trackNo: '',
        trackOf: '',
        diskNo: '',
        diskOf: '',
        comment: '',
        lyrics: '',
        composer: '',
        lyricist: '',
        conductor: '',
        remixer: '',
        producer: '',
        label: '',
        grouping: '',
        subtitle: '',
        bpm: '',
        catalognumber: ''
    }
}

function commonValue(common: Record<string, string>, ...keys: string[]): string {
    for (const key of keys) {
        const value = common[key]?.trim()
        if (value) return value
    }
    return ''
}

function parseFractionPair(value: string): { no: string; of: string } {
    const trimmed = value.trim()
    if (!trimmed) return { no: '', of: '' }
    const slash = trimmed.indexOf('/')
    if (slash >= 0) {
        return {
            no: trimmed.slice(0, slash).trim(),
            of: trimmed.slice(slash + 1).trim()
        }
    }
    return { no: trimmed, of: '' }
}

/** 从路径取不含扩展名的文件名 */
export function fileStemFromPath(filePath: string): string {
    const base = filePath.replace(/^.*[/\\]/, '')
    const dot = base.lastIndexOf('.')
    return dot > 0 ? base.slice(0, dot) : base
}

/** 文件名（不含扩展名）末尾是否含多余下划线，如 `曲名_.flac` */
export function filenameStemHasTrailingUnderscore(filePath: string): boolean {
    const stem = fileStemFromPath(filePath).trimEnd()
    return stem.endsWith('_')
}

/** 去掉文件名末尾多余下划线，保留扩展名 */
export function rebuildFileNameWithoutTrailingUnderscore(
    filePath: string
): string | null {
    const base = filePath.replace(/^.*[/\\]/, '')
    const dot = base.lastIndexOf('.')
    const ext = dot > 0 ? base.slice(dot) : ''
    const stem = fileStemFromPath(filePath)
    if (!filenameStemHasTrailingUnderscore(filePath)) return null
    const trimmedStem = stem.replace(/_+$/, '')
    if (!trimmedStem) return null
    return `${trimmedStem}${ext}`
}

/** 常见「艺人 - 曲名」分隔符（按优先级） */
const ARTIST_TITLE_SEPARATORS = [' - ', ' – ', ' — ', ' | ', '·'] as const

export interface ParsedArtistTitleFromFilename {
    artist: string
    title: string
    /** 是否按分隔符拆成艺人 + 曲名 */
    split: boolean
}

/**
 * 从文件名解析艺人 / 曲名（如 `艺人 - 歌名.mp3`）。
 * 无分隔符时整段作为曲名。
 */
export function parseArtistTitleFromFilePath(
    filePath: string
): ParsedArtistTitleFromFilename {
    const stem = fileStemFromPath(filePath).trim()
    if (!stem) {
        return { artist: '', title: '', split: false }
    }

    for (const sep of ARTIST_TITLE_SEPARATORS) {
        const idx = stem.indexOf(sep)
        if (idx > 0) {
            const artist = stem.slice(0, idx).trim()
            const title = stem.slice(idx + sep.length).trim()
            if (artist && title) {
                return { artist, title, split: true }
            }
        }
    }

    const dash = stem.indexOf('-')
    if (dash > 0) {
        const artist = stem.slice(0, dash).trim()
        const title = stem.slice(dash + 1).trim()
        if (artist && title) {
            return { artist, title, split: true }
        }
    }

    return { artist: '', title: stem, split: false }
}

/**
 * 保留原有「艺人 - 曲名」分隔符，仅替换艺人段（用于文件名艺人规范化重命名）。
 */
export function rebuildFileNameWithArtist(
    filePath: string,
    newArtist: string
): string | null {
    const parsed = parseArtistTitleFromFilePath(filePath)
    if (!parsed.split || !parsed.title) return null

    const base = filePath.replace(/^.*[/\\]/, '')
    const dot = base.lastIndexOf('.')
    const ext = dot > 0 ? base.slice(dot) : ''
    const stem = fileStemFromPath(filePath)

    for (const sep of ARTIST_TITLE_SEPARATORS) {
        const idx = stem.indexOf(sep)
        if (idx > 0 && stem.slice(idx + sep.length).trim() === parsed.title) {
            return `${newArtist}${sep}${parsed.title}${ext}`
        }
    }

    const dash = stem.indexOf('-')
    if (dash > 0 && stem.slice(dash + 1).trim() === parsed.title) {
        if (stem.includes(' - ')) {
            return `${newArtist} - ${parsed.title}${ext}`
        }
        return `${newArtist}-${parsed.title}${ext}`
    }

    return null
}

/** 从已读取的元数据填充编辑表单 */
export function metaInfoToEditForm(meta: AudioFileMetaInfo): AudioMetaEditForm {
    const common = meta.common ?? {}
    const track = parseFractionPair(commonValue(common, 'track'))
    const disk = parseFractionPair(commonValue(common, 'disk'))

    return {
        title: commonValue(common, 'title'),
        artist: commonValue(common, 'artist', 'artists'),
        album: commonValue(common, 'album'),
        albumartist: commonValue(common, 'albumartist'),
        genre: commonValue(common, 'genre'),
        year: commonValue(common, 'year', 'originalyear'),
        date: commonValue(common, 'date', 'originaldate', 'releasedate'),
        trackNo: track.no || commonValue(common, 'tracknumber'),
        trackOf: track.of || commonValue(common, 'totaltracks'),
        diskNo: disk.no || commonValue(common, 'disknumber'),
        diskOf: disk.of || commonValue(common, 'totaldiscs'),
        comment: commonValue(common, 'comment', 'description'),
        lyrics: commonValue(common, 'lyrics'),
        composer: commonValue(common, 'composer'),
        lyricist: commonValue(common, 'lyricist'),
        conductor: commonValue(common, 'conductor'),
        remixer: commonValue(common, 'remixer'),
        producer: commonValue(common, 'producer'),
        label: commonValue(common, 'label'),
        grouping: commonValue(common, 'grouping'),
        subtitle: commonValue(common, 'subtitle'),
        bpm: commonValue(common, 'bpm'),
        catalognumber: commonValue(common, 'catalognumber')
    }
}

function splitMultiField(value: string): string[] | undefined {
    const parts = splitMetaDisplayValues(value)
    return parts.length > 0 ? parts : undefined
}

function parseOptionalInt(value: string): number | undefined {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    const n = Number.parseInt(trimmed, 10)
    return Number.isFinite(n) && n > 0 ? n : undefined
}

function trimOrUndefined(value: string): string | undefined {
    const trimmed = value.trim()
    return trimmed || undefined
}

/** 是否支持写入标签（当前仅 mp3 / flac） */
export function isEditableAudioMetaPath(filePath: string): boolean {
    const ext = fileExtensionLower(filePath)
    if (isDecryptableExtension(ext)) return false
    return ext === 'mp3' || ext === 'flac'
}

/** 表单 → 写入用的 IMusicMeta 形状（纯 JSON，供 IPC / 主进程使用） */
export function editFormToMusicMetaJson(
    form: AudioMetaEditForm,
    pictureBase64?: string | null
): Record<string, unknown> {
    const out: Record<string, unknown> = {
        title: form.title.trim(),
        artists: splitMultiField(form.artist),
        album: trimOrUndefined(form.album),
        albumartist: trimOrUndefined(form.albumartist),
        genre: splitMultiField(form.genre),
        year: parseOptionalInt(form.year),
        date: trimOrUndefined(form.date),
        trackNo: parseOptionalInt(form.trackNo) ?? null,
        trackOf: parseOptionalInt(form.trackOf) ?? null,
        diskNo: parseOptionalInt(form.diskNo) ?? null,
        diskOf: parseOptionalInt(form.diskOf) ?? null,
        comment: splitMultiField(form.comment),
        lyrics: splitMultiField(form.lyrics),
        composer: splitMultiField(form.composer),
        lyricist: splitMultiField(form.lyricist),
        conductor: splitMultiField(form.conductor),
        remixer: splitMultiField(form.remixer),
        producer: splitMultiField(form.producer),
        label: splitMultiField(form.label),
        grouping: trimOrUndefined(form.grouping),
        subtitle: splitMultiField(form.subtitle),
        bpm: parseOptionalInt(form.bpm),
        catalognumber: splitMultiField(form.catalognumber)
    }

    if (pictureBase64 === null) {
        out.picture = null
    } else if (typeof pictureBase64 === 'string' && pictureBase64.length > 0) {
        out.picture = pictureBase64
    }

    return out
}
