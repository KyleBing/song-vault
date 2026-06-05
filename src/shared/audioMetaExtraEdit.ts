import type { AudioFileMetaInfo } from './audioFileMeta'
import {
    isMusicBrainzMetaKey,
    isMusicBrainzNativeTag,
    isVorbisNativeTag,
    labelForCommonKey,
    labelForMusicBrainzCommonKey,
    labelForMusicBrainzNativeTag,
    labelForNativeTag,
    labelForVorbisNativeTag,
    nativeTagFormatId
} from './audioMetaLabels'
import { fileExtensionLower } from './pathLite'

/** 扩展 / 其它标签编辑行（每条对应文件内一条原生或额外 common 项） */
export interface AudioMetaExtraTagRow {
    /** Vue 列表 key */
    rowKey: string
    label: string
    /** Vorbis / ID3 键名（如 ARTIST、TPE1）或 common 键名 */
    tagKey: string
    /** 完整原生 ID（如 vorbis:ARTIST） */
    nativeId?: string
    source: 'native' | 'common' | 'musicbrainz'
    value: string
    removed: boolean
}

export interface AudioMetaExtraEditState {
    extendedNative: AudioMetaExtraTagRow[]
    otherExtra: AudioMetaExtraTagRow[]
}

const SKIP_OTHER_COMMON_KEYS = new Set([
    'picture',
    'artwork',
    'title',
    'artist',
    'artists',
    'album',
    'albumartist',
    'genre',
    'year',
    'originalyear',
    'date',
    'originaldate',
    'releasedate',
    'track',
    'tracknumber',
    'totaltracks',
    'disk',
    'disknumber',
    'totaldiscs',
    'comment',
    'description',
    'lyrics',
    'composer',
    'lyricist',
    'conductor',
    'remixer',
    'producer',
    'label',
    'grouping',
    'subtitle',
    'bpm',
    'catalognumber'
])

const BINARY_NATIVE_TAG_IDS = new Set(['APIC', 'PIC', 'COVERART'])

function nativeTagIdFromFullId(fullId: string): string {
    const sep = fullId.indexOf(':')
    return sep >= 0 ? fullId.slice(sep + 1) : fullId
}

export function isId3NativeTag(fullId: string): boolean {
    return nativeTagFormatId(fullId).startsWith('id3v2')
}

function isExtendedNativeTag(fullId: string, ext: string): boolean {
    if (isMusicBrainzNativeTag(fullId)) return false
    const tagId = nativeTagIdFromFullId(fullId).toUpperCase()
    if (BINARY_NATIVE_TAG_IDS.has(tagId)) return false
    if (ext === 'flac') return isVorbisNativeTag(fullId)
    if (ext === 'mp3') return isId3NativeTag(fullId)
    return false
}

function isOtherNativeTag(fullId: string, ext: string): boolean {
    if (isMusicBrainzNativeTag(fullId)) return false
    const tagId = nativeTagIdFromFullId(fullId).toUpperCase()
    if (BINARY_NATIVE_TAG_IDS.has(tagId)) return false
    return !isExtendedNativeTag(fullId, ext)
}

function nextRowKey(prefix: string, index: number, id: string): string {
    return `${prefix}-${index}-${id}`
}

/** 扩展 Tab：FLAC → Vorbis；MP3 → ID3v2 原生帧 */
export function buildExtendedNativeEditRows(
    meta: AudioFileMetaInfo,
    filePath: string
): AudioMetaExtraTagRow[] {
    const ext = fileExtensionLower(filePath)
    const rows: AudioMetaExtraTagRow[] = []
    let index = 0

    for (const tag of meta.native ?? []) {
        if (!isExtendedNativeTag(tag.id, ext)) continue
        const tagKey = nativeTagIdFromFullId(tag.id)
        rows.push({
            rowKey: nextRowKey('ext', index++, tag.id),
            label:
                ext === 'flac'
                    ? labelForVorbisNativeTag(tag.id)
                    : labelForNativeTag(tag.id),
            tagKey,
            nativeId: tag.id,
            source: 'native',
            value: tag.value,
            removed: false
        })
    }

    return rows.sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
    )
}

/** 其它 Tab：MusicBrainz、未纳入常规表单的 common、非 Vorbis/ID3 原生标签 */
export function buildOtherExtraEditRows(
    meta: AudioFileMetaInfo,
    filePath: string
): AudioMetaExtraTagRow[] {
    const ext = fileExtensionLower(filePath)
    const rows: AudioMetaExtraTagRow[] = []
    let index = 0

    for (const [key, value] of Object.entries(meta.common ?? {})) {
        if (!value?.trim()) continue
        if (SKIP_OTHER_COMMON_KEYS.has(key)) continue
        if (isMusicBrainzMetaKey(key)) {
            rows.push({
                rowKey: nextRowKey('mbc', index++, key),
                label: labelForMusicBrainzCommonKey(key),
                tagKey: key,
                source: 'musicbrainz',
                value,
                removed: false
            })
            continue
        }
        rows.push({
            rowKey: nextRowKey('com', index++, key),
            label: labelForCommonKey(key),
            tagKey: key,
            source: 'common',
            value,
            removed: false
        })
    }

    for (const tag of meta.native ?? []) {
        if (!isOtherNativeTag(tag.id, ext)) continue
        const tagKey = nativeTagIdFromFullId(tag.id)
        if (isMusicBrainzNativeTag(tag.id)) {
            rows.push({
                rowKey: nextRowKey('mbn', index++, tag.id),
                label: labelForMusicBrainzNativeTag(tag.id),
                tagKey,
                nativeId: tag.id,
                source: 'musicbrainz',
                value: tag.value,
                removed: false
            })
            continue
        }
        rows.push({
            rowKey: nextRowKey('nat', index++, tag.id),
            label: labelForNativeTag(tag.id),
            tagKey,
            nativeId: tag.id,
            source: 'native',
            value: tag.value,
            removed: false
        })
    }

    return rows.sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
    )
}

export function metaInfoToExtraEditState(
    meta: AudioFileMetaInfo,
    filePath: string
): AudioMetaExtraEditState {
    return {
        extendedNative: buildExtendedNativeEditRows(meta, filePath),
        otherExtra: buildOtherExtraEditRows(meta, filePath)
    }
}

export function emptyExtraEditState(): AudioMetaExtraEditState {
    return { extendedNative: [], otherExtra: [] }
}

export function normalizeNativeTagKey(tagKey: string): string {
    return tagKey.trim().toUpperCase()
}

/** 供写入前过滤：未删除且有值 */
export function activeExtraTagRows(
    rows: AudioMetaExtraTagRow[]
): AudioMetaExtraTagRow[] {
    return rows.filter((row) => !row.removed && row.value.trim())
}

type StringListMetaKey =
    | 'artists'
    | 'genre'
    | 'comment'
    | 'lyrics'
    | 'composer'
    | 'lyricist'
    | 'conductor'
    | 'remixer'
    | 'producer'
    | 'label'
    | 'subtitle'
    | 'catalognumber'

type StringMetaKey = 'title' | 'album' | 'albumartist' | 'grouping' | 'date'

const NATIVE_KEY_FAMILIES: Array<{
    keys: Set<string>
    kind: 'stringList' | 'string' | 'number' | 'track' | 'disk'
    field: StringListMetaKey | StringMetaKey | 'year' | 'bpm' | 'trackNo' | 'trackOf' | 'diskNo' | 'diskOf'
}> = [
    { keys: new Set(['ARTIST', 'ARTISTS', 'TPE1']), kind: 'stringList', field: 'artists' },
    { keys: new Set(['TITLE', 'TIT2']), kind: 'string', field: 'title' },
    { keys: new Set(['ALBUM', 'TALB']), kind: 'string', field: 'album' },
    { keys: new Set(['ALBUMARTIST', 'TPE2']), kind: 'string', field: 'albumartist' },
    { keys: new Set(['GENRE', 'TCON']), kind: 'stringList', field: 'genre' },
    { keys: new Set(['DATE', 'TYER', 'TDRC']), kind: 'string', field: 'date' },
    { keys: new Set(['COMMENT', 'COMM']), kind: 'stringList', field: 'comment' },
    { keys: new Set(['LYRICS', 'USLT']), kind: 'stringList', field: 'lyrics' },
    { keys: new Set(['COMPOSER', 'TCOM']), kind: 'stringList', field: 'composer' },
    { keys: new Set(['LYRICIST']), kind: 'stringList', field: 'lyricist' },
    { keys: new Set(['CONDUCTOR']), kind: 'stringList', field: 'conductor' },
    { keys: new Set(['REMIXER']), kind: 'stringList', field: 'remixer' },
    { keys: new Set(['PRODUCER']), kind: 'stringList', field: 'producer' },
    { keys: new Set(['LABEL', 'TPUB']), kind: 'stringList', field: 'label' },
    { keys: new Set(['GROUPING']), kind: 'string', field: 'grouping' },
    { keys: new Set(['SUBTITLE']), kind: 'stringList', field: 'subtitle' },
    { keys: new Set(['CATALOGNUMBER']), kind: 'stringList', field: 'catalognumber' },
    { keys: new Set(['BPM', 'TBPM']), kind: 'number', field: 'bpm' },
    { keys: new Set(['TRACKNUMBER', 'TRCK']), kind: 'track', field: 'trackNo' },
    { keys: new Set(['TRACKTOTAL']), kind: 'track', field: 'trackOf' },
    { keys: new Set(['DISCNUMBER', 'TPOS']), kind: 'disk', field: 'diskNo' },
    { keys: new Set(['DISCTOTAL']), kind: 'disk', field: 'diskOf' }
]

function rowMatchesFamily(row: AudioMetaExtraTagRow, keys: Set<string>): boolean {
    return keys.has(normalizeNativeTagKey(row.tagKey))
}

function familyToken(keys: Set<string>): string {
    return [...keys].sort().join('|')
}

function parseTrackPart(value: string): number | undefined {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    const slash = trimmed.indexOf('/')
    const part = slash >= 0 ? trimmed.slice(0, slash).trim() : trimmed
    const n = Number.parseInt(part, 10)
    return Number.isFinite(n) && n > 0 ? n : undefined
}

function parseTrackOf(value: string): number | undefined {
    const trimmed = value.trim()
    const slash = trimmed.indexOf('/')
    if (slash < 0) return undefined
    const n = Number.parseInt(trimmed.slice(slash + 1).trim(), 10)
    return Number.isFinite(n) && n > 0 ? n : undefined
}

/** 将扩展 Tab 中用户改过的原生标签覆盖到 IMusicMeta（用于写入托管字段） */
export function applyExtensionRowsToMusicMeta(
    meta: Record<string, unknown>,
    rows: AudioMetaExtraTagRow[],
    touchedFamilies?: ReadonlySet<string>
): Record<string, unknown> {
    const next: Record<string, unknown> = { ...meta }
    const active = activeExtraTagRows(rows)

    for (const family of NATIVE_KEY_FAMILIES) {
        const token = familyToken(family.keys)
        if (touchedFamilies && !touchedFamilies.has(token)) continue

        const touched = rows.some((row) => rowMatchesFamily(row, family.keys))
        if (!touched) continue

        const values = active
            .filter((row) => rowMatchesFamily(row, family.keys))
            .map((row) => row.value.trim())
            .filter(Boolean)

        if (family.kind === 'stringList') {
            next[family.field] = values.length ? values : undefined
            continue
        }

        if (family.kind === 'string') {
            next[family.field] = values[0] ?? ''
            continue
        }

        if (family.kind === 'number') {
            const n = values[0] ? Number.parseInt(values[0], 10) : undefined
            next[family.field] =
                n !== undefined && Number.isFinite(n) && n > 0 ? n : undefined
            continue
        }

        if (family.kind === 'track') {
            if (family.field === 'trackNo') {
                next.trackNo = values[0] ? parseTrackPart(values[0]) : undefined
            } else {
                next.trackOf =
                    values[0]?.includes('/') ? parseTrackOf(values[0]) : values[0]
                        ? Number.parseInt(values[0], 10) || undefined
                        : undefined
            }
            continue
        }

        if (family.kind === 'disk') {
            if (family.field === 'diskNo') {
                next.diskNo = values[0] ? parseTrackPart(values[0]) : undefined
            } else {
                next.diskOf =
                    values[0]?.includes('/') ? parseTrackOf(values[0]) : values[0]
                        ? Number.parseInt(values[0], 10) || undefined
                        : undefined
            }
        }
    }

    return next
}

export function familyTokenForTagKey(tagKey: string): string | null {
    const normalized = normalizeNativeTagKey(tagKey)
    for (const family of NATIVE_KEY_FAMILIES) {
        if (family.keys.has(normalized)) {
            return familyToken(family.keys)
        }
    }
    return null
}

export const MANAGED_FLAC_TAG_KEY_SET = new Set([
    'TITLE',
    'ARTIST',
    'ARTISTS',
    'ALBUM',
    'ALBUMARTIST',
    'GENRE',
    'DATE',
    'TRACKNUMBER',
    'TRACKTOTAL',
    'DISCNUMBER',
    'DISCTOTAL',
    'COMMENT',
    'LYRICS',
    'COMPOSER',
    'LYRICIST',
    'CONDUCTOR',
    'REMIXER',
    'PRODUCER',
    'LABEL',
    'GROUPING',
    'SUBTITLE',
    'CATALOGNUMBER',
    'BPM'
])

export const MANAGED_MP3_FRAME_ID_SET = new Set([
    'TPE1',
    'TIT2',
    'TALB',
    'TPE2',
    'TCON',
    'TYER',
    'TDRC',
    'TRCK',
    'TPOS',
    'COMM',
    'USLT',
    'TCOM',
    'TBPM',
    'TPUB',
    'APIC'
])

export function isManagedNativeTagKey(tagKey: string, ext: 'mp3' | 'flac'): boolean {
    const normalized = normalizeNativeTagKey(tagKey)
    return ext === 'flac'
        ? MANAGED_FLAC_TAG_KEY_SET.has(normalized)
        : MANAGED_MP3_FRAME_ID_SET.has(normalized)
}

/** 写入文件时需要追加的非托管原生 / common / MusicBrainz 标签 */
export function collectPersistedExtraTagRows(
    extendedNative: AudioMetaExtraTagRow[],
    otherExtra: AudioMetaExtraTagRow[],
    ext: 'mp3' | 'flac'
): AudioMetaExtraTagRow[] {
    const out: AudioMetaExtraTagRow[] = []

    for (const row of [...extendedNative, ...otherExtra]) {
        if (row.removed || !row.value.trim()) continue
        if (row.source === 'native' && isManagedNativeTagKey(row.tagKey, ext)) {
            continue
        }
        out.push(row)
    }

    return out
}

const NATIVE_ALIAS_GROUPS = [
    ['ARTIST', 'ARTISTS', 'TPE1'],
    ['TITLE', 'TIT2'],
    ['ALBUM', 'TALB'],
    ['ALBUMARTIST', 'TPE2']
] as const

const SINGLE_VALUE_CANONICAL_KEYS = new Set([
    'TITLE',
    'ALBUM',
    'ALBUMARTIST',
    'DATE',
    'BPM',
    'TRACKNUMBER',
    'TRACKTOTAL',
    'DISCNUMBER',
    'DISCTOTAL',
    'GROUPING'
])

function canonicalNativeGroup(tagKey: string): string {
    const upper = normalizeNativeTagKey(tagKey)
    for (const group of NATIVE_ALIAS_GROUPS) {
        if ((group as readonly string[]).includes(upper)) {
            return group[0]
        }
    }
    return upper
}

function preferredTagKeyInGroup(groupRows: AudioMetaExtraTagRow[]): string {
    const priority = [
        'ARTIST',
        'TITLE',
        'ALBUM',
        'ALBUMARTIST',
        'TIT2',
        'TPE1',
        'TALB',
        'TPE2',
        'ARTISTS'
    ]
    const keys = new Set(
        groupRows.map((row) => normalizeNativeTagKey(row.tagKey))
    )
    for (const preferred of priority) {
        if (keys.has(preferred)) return preferred
    }
    return normalizeNativeTagKey(groupRows[0]?.tagKey ?? '')
}

function normalizeValueToken(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function uniqueTrimmedValues(values: string[]): string[] {
    const seen = new Set<string>()
    const out: string[] = []
    for (const value of values) {
        const trimmed = value.trim()
        if (!trimmed) continue
        const token = normalizeValueToken(trimmed)
        if (seen.has(token)) continue
        seen.add(token)
        out.push(trimmed)
    }
    return out
}

/** 扩展原生标签是否存在同键重复或别名重复（如 ARTIST + ARTISTS） */
export function detectDuplicateExtendedNativeTags(
    meta: AudioFileMetaInfo,
    filePath: string
): { hasDuplicate: boolean; duplicateKeys: string[] } {
    const rows = buildExtendedNativeEditRows(meta, filePath)
    if (!rows.length) {
        return { hasDuplicate: false, duplicateKeys: [] }
    }

    const rawKeyCounts = new Map<string, number>()
    const canonToRawKeys = new Map<string, Set<string>>()

    for (const row of rows) {
        const raw = normalizeNativeTagKey(row.tagKey)
        rawKeyCounts.set(raw, (rawKeyCounts.get(raw) ?? 0) + 1)
        const canon = canonicalNativeGroup(raw)
        if (!canonToRawKeys.has(canon)) {
            canonToRawKeys.set(canon, new Set())
        }
        canonToRawKeys.get(canon)!.add(raw)
    }

    const duplicateKeys = new Set<string>()
    for (const [raw, count] of rawKeyCounts) {
        if (count > 1) duplicateKeys.add(raw)
    }
    for (const rawKeys of canonToRawKeys.values()) {
        if (rawKeys.size > 1) {
            for (const raw of rawKeys) duplicateKeys.add(raw)
        }
    }

    return {
        hasDuplicate: duplicateKeys.size > 0,
        duplicateKeys: [...duplicateKeys].sort()
    }
}

function canonicalGroupsForTouchedFamilies(
    touched: ReadonlySet<string>
): Set<string> {
    const out = new Set<string>()
    for (const family of NATIVE_KEY_FAMILIES) {
        if (touched.has(familyToken(family.keys))) {
            out.add([...family.keys][0]!)
        }
    }
    return out
}

/**
 * 写入前整理扩展原生行：被 touch 的族（如 ARTIST/TITLE）合并别名并去重，只保留当前编辑后的值。
 */
export function prepareExtendedNativeRowsForWrite(
    rows: AudioMetaExtraTagRow[],
    touchedFamilies?: ReadonlySet<string>
): AudioMetaExtraTagRow[] {
    if (!touchedFamilies?.size) {
        return rows
    }

    const active = activeExtraTagRows(rows)
    const touchedGroups = canonicalGroupsForTouchedFamilies(touchedFamilies)

    const untouchedActive = active.filter(
        (row) => !touchedGroups.has(canonicalNativeGroup(row.tagKey))
    )
    const touchedActive = active.filter((row) =>
        touchedGroups.has(canonicalNativeGroup(row.tagKey))
    )

    const prepared = [
        ...dedupeExtendedNativeRows(untouchedActive),
        ...dedupeExtendedNativeRows(touchedActive, { collapseAliasGroups: true })
    ]

    return prepared.sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
    )
}

function valuesForDedupeGroup(
    groupRows: AudioMetaExtraTagRow[],
    aliasCollapse: boolean
): string[] {
    if (!aliasCollapse) {
        return uniqueTrimmedValues(groupRows.map((row) => row.value))
    }

    const tagKey = preferredTagKeyInGroup(groupRows)
    const preferredRows = groupRows.filter(
        (row) => normalizeNativeTagKey(row.tagKey) === tagKey
    )
    const source = preferredRows.length ? preferredRows : groupRows
    return uniqueTrimmedValues(source.map((row) => row.value))
}

/** 合并扩展原生标签中的重复项，保留唯一值 */
export function dedupeExtendedNativeRows(
    rows: AudioMetaExtraTagRow[],
    options?: {
        collapseAliasGroups?: boolean
        /** 同族多条（同键或别名并存）时只保留第一个值 */
        keepSingleValueWhenDuplicate?: boolean
    }
): AudioMetaExtraTagRow[] {
    const aliasCollapse = options?.collapseAliasGroups ?? false
    const keepSingleWhenDuplicate = options?.keepSingleValueWhenDuplicate ?? false
    const active = rows.filter((row) => !row.removed && row.value.trim())
    const grouped = new Map<string, AudioMetaExtraTagRow[]>()

    for (const row of active) {
        const canon = canonicalNativeGroup(row.tagKey)
        if (!grouped.has(canon)) grouped.set(canon, [])
        grouped.get(canon)!.push(row)
    }

    const out: AudioMetaExtraTagRow[] = []
    let index = 0

    for (const [canon, groupRows] of grouped) {
        const tagKey = preferredTagKeyInGroup(groupRows)
        let values = valuesForDedupeGroup(groupRows, aliasCollapse)
        if (
            keepSingleWhenDuplicate &&
            groupRows.length > 1 &&
            values.length > 0
        ) {
            values = [values[0]!]
        }
        if (!values.length) continue

        const template = groupRows[0]!

        if (SINGLE_VALUE_CANONICAL_KEYS.has(canon)) {
            out.push({
                rowKey: `dedupe-${index++}-${tagKey}`,
                label: template.label,
                tagKey,
                nativeId: template.nativeId,
                source: 'native',
                value: values[0]!,
                removed: false
            })
            continue
        }

        for (const value of values) {
            out.push({
                rowKey: `dedupe-${index++}-${tagKey}-${index}`,
                label: template.label,
                tagKey,
                nativeId: template.nativeId,
                source: 'native',
                value,
                removed: false
            })
        }
    }

    return out.sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
    )
}

/** 写入前去重：为所有存在重复的扩展原生族标记 touched */
export function collectTouchedFamiliesForDuplicateGroups(
    rows: AudioMetaExtraTagRow[]
): Set<string> {
    const active = rows.filter((row) => !row.removed && row.value.trim())
    const grouped = new Map<string, AudioMetaExtraTagRow[]>()

    for (const row of active) {
        const canon = canonicalNativeGroup(row.tagKey)
        if (!grouped.has(canon)) grouped.set(canon, [])
        grouped.get(canon)!.push(row)
    }

    const touched = new Set<string>()
    for (const groupRows of grouped.values()) {
        if (groupRows.length <= 1) continue
        for (const row of groupRows) {
            const token = familyTokenForTagKey(row.tagKey)
            if (token) touched.add(token)
        }
    }
    return touched
}

export function duplicateKeysForArtistStack(keys: string[]): string[] {
    return keys.filter((key) =>
        ['ARTIST', 'ARTISTS', 'TPE1'].includes(normalizeNativeTagKey(key))
    )
}

export function duplicateKeysForTitleStack(keys: string[]): string[] {
    return keys.filter((key) =>
        ['TITLE', 'TIT2', 'ALBUM', 'TALB'].includes(normalizeNativeTagKey(key))
    )
}
