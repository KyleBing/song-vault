import fs from 'fs'
import path from 'path'
import { parseFile } from 'music-metadata'
import { parseAudioFileSafe } from '../shared/parseAudioFileSafe'
import {
    WriteMetaToFlac,
    WriteMetaToMp3,
    buildMusicMetaFromSources,
    type ExtraNativeTagWriteEntry,
    type FlacCoverWriteMode,
    type IMusicMeta
} from '../unlock-music/decrypt/utils'
import { validateFlacBufferStructure, locateFlacInBuffer } from '../unlock-music/decrypt/flacRewrite'
import {
    applyExtensionRowsToMusicMeta,
    buildExtendedNativeEditRows,
    collectPersistedExtraTagRows,
    collectTouchedFamiliesForDuplicateGroups,
    dedupeExtendedNativeRows,
    detectDuplicateExtendedNativeTags,
    familyTokenForTagKey,
    prepareExtendedNativeRowsForWrite,
    type AudioMetaExtraTagRow
} from '../shared/audioMetaExtraEdit'
import { readAudioFileMeta } from '../shared/readAudioFileMeta'
import { stripId3v1FromMp3Buffer } from '../unlock-music/decrypt/utils'
import { containsTraditionalChinese } from '../shared/traditionalChinese'
import { toSimplifiedChinese } from './traditionalChineseConvert'
import {
    editFormToMusicMetaJson,
    isEditableAudioMetaPath,
    metaInfoToEditForm,
    type AudioMetaEditForm,
    type WriteAudioMetaResult
} from '../shared/audioMetaEdit'
import { fileExtensionLower } from '../shared/pathLite'

/** ID3/APIC 嵌入上限，过大时跳过封面避免写入失败 */
const MAX_EMBED_PICTURE_BYTES = 512 * 1024

function pictureArrayBufferFromParsed(
    parsed: Awaited<ReturnType<typeof parseFile>>
): ArrayBuffer | undefined {
    const data = parsed.common.picture?.[0]?.data
    if (!data?.length) return undefined
    return Uint8Array.from(data).buffer
}

function normalizeEmbedPicture(
    picture: ArrayBuffer | undefined
): ArrayBuffer | undefined {
    if (!picture?.byteLength) return undefined
    if (picture.byteLength <= MAX_EMBED_PICTURE_BYTES) return picture
    return undefined
}

function musicMetaFromJson(json: Record<string, unknown>): IMusicMeta {
    const pictureRaw = json.picture
    let picture: ArrayBuffer | undefined
    if (typeof pictureRaw === 'string' && pictureRaw.length > 0) {
        picture = Uint8Array.from(Buffer.from(pictureRaw, 'base64')).buffer
    }

    return {
        title: typeof json.title === 'string' ? json.title : '',
        artists: Array.isArray(json.artists)
            ? json.artists.filter((v): v is string => typeof v === 'string')
            : undefined,
        album: typeof json.album === 'string' ? json.album : undefined,
        albumartist: typeof json.albumartist === 'string' ? json.albumartist : undefined,
        genre: Array.isArray(json.genre)
            ? json.genre.filter((v): v is string => typeof v === 'string')
            : undefined,
        year: typeof json.year === 'number' ? json.year : undefined,
        date: typeof json.date === 'string' ? json.date : undefined,
        trackNo: typeof json.trackNo === 'number' ? json.trackNo : undefined,
        trackOf: typeof json.trackOf === 'number' ? json.trackOf : undefined,
        diskNo: typeof json.diskNo === 'number' ? json.diskNo : undefined,
        diskOf: typeof json.diskOf === 'number' ? json.diskOf : undefined,
        comment: Array.isArray(json.comment)
            ? json.comment.filter((v): v is string => typeof v === 'string')
            : undefined,
        lyrics: Array.isArray(json.lyrics)
            ? json.lyrics.filter((v): v is string => typeof v === 'string')
            : undefined,
        composer: Array.isArray(json.composer)
            ? json.composer.filter((v): v is string => typeof v === 'string')
            : undefined,
        lyricist: Array.isArray(json.lyricist)
            ? json.lyricist.filter((v): v is string => typeof v === 'string')
            : undefined,
        conductor: Array.isArray(json.conductor)
            ? json.conductor.filter((v): v is string => typeof v === 'string')
            : undefined,
        remixer: Array.isArray(json.remixer)
            ? json.remixer.filter((v): v is string => typeof v === 'string')
            : undefined,
        producer: Array.isArray(json.producer)
            ? json.producer.filter((v): v is string => typeof v === 'string')
            : undefined,
        label: Array.isArray(json.label)
            ? json.label.filter((v): v is string => typeof v === 'string')
            : undefined,
        grouping: typeof json.grouping === 'string' ? json.grouping : undefined,
        subtitle: Array.isArray(json.subtitle)
            ? json.subtitle.filter((v): v is string => typeof v === 'string')
            : undefined,
        bpm: typeof json.bpm === 'number' ? json.bpm : undefined,
        catalognumber: Array.isArray(json.catalognumber)
            ? json.catalognumber.filter((v): v is string => typeof v === 'string')
            : undefined,
        picture: pictureRaw === null ? undefined : picture
    }
}

function assertTaggedBufferLooksValid(
    original: Buffer,
    tagged: Buffer,
    ext: string
): void {
    if (ext === 'flac') {
        if (tagged.length < 42 || !locateFlacInBuffer(tagged)) {
            throw new Error('FLAC 写入结果无效（文件头损坏）')
        }
        validateFlacBufferStructure(tagged)
        return
    }

    if (ext === 'mp3') {
        if (tagged.length < 128) {
            throw new Error('MP3 写入结果无效（文件过小）')
        }
        const head = tagged.toString('ascii', 0, 3)
        const frameSync =
            tagged[0] === 0xff && (tagged[1]! & 0xe0) === 0xe0
        if (head !== 'ID3' && !frameSync) {
            throw new Error('MP3 写入结果无效（缺少 ID3 或音频帧）')
        }
    }

    const minBytes = Math.max(4096, Math.floor(original.length * 0.5))
    if (tagged.length < minBytes) {
        throw new Error('写入后文件体积异常缩小，可能已损坏')
    }
}

function writeTaggedBuffer(
    audioData: Buffer,
    meta: IMusicMeta,
    parsed: Awaited<ReturnType<typeof parseFile>>,
    ext: string,
    replaceExisting: boolean,
    extraTags: ExtraNativeTagWriteEntry[] = [],
    flacCoverMode: FlacCoverWriteMode = 'preserve'
): Buffer {
    const tagged =
        ext === 'mp3'
            ? WriteMetaToMp3(
                  audioData,
                  meta,
                  parsed,
                  replaceExisting,
                  extraTags
              )
            : WriteMetaToFlac(
                  audioData,
                  meta,
                  parsed,
                  replaceExisting,
                  extraTags,
                  flacCoverMode
              )
    assertTaggedBufferLooksValid(audioData, tagged, ext)
    return tagged
}

async function writeValidatedTaggedFile(
    resolved: string,
    audioData: Buffer,
    meta: IMusicMeta,
    parsed: Awaited<ReturnType<typeof parseFile>>,
    ext: string,
    replaceExisting: boolean,
    extraTags: ExtraNativeTagWriteEntry[] = [],
    flacCoverMode: FlacCoverWriteMode = 'preserve'
): Promise<WriteAudioMetaResult> {
    const tmpPath = `${resolved}.songvault-tag-tmp`
    let tagged: Buffer

    try {
        tagged = writeTaggedBuffer(
            audioData,
            meta,
            parsed,
            ext,
            replaceExisting,
            extraTags,
            flacCoverMode
        )
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, filePath: resolved, message: msg || '写入标签失败' }
    }

    try {
        fs.writeFileSync(tmpPath, tagged)
        await parseFile(tmpPath, { skipCovers: true, duration: false })
        fs.renameSync(tmpPath, resolved)
        return { ok: true, filePath: resolved }
    } catch (err) {
        try {
            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
        } catch {
            /* ignore */
        }
        const msg = err instanceof Error ? err.message : String(err)
        return {
            ok: false,
            filePath: resolved,
            message: msg || '写入后校验失败，原文件未改动'
        }
    }
}

function tryWriteTaggedFile(
    resolved: string,
    audioData: Buffer,
    meta: IMusicMeta,
    parsed: Awaited<ReturnType<typeof parseFile>>,
    ext: string,
    replaceExisting: boolean
): void {
    try {
        fs.writeFileSync(
            resolved,
            writeTaggedBuffer(audioData, meta, parsed, ext, replaceExisting)
        )
        return
    } catch (firstErr) {
        if (!meta.picture) throw firstErr
        const withoutCover: IMusicMeta = { ...meta, picture: undefined }
        fs.writeFileSync(
            resolved,
            writeTaggedBuffer(
                audioData,
                withoutCover,
                parsed,
                ext,
                replaceExisting
            )
        )
    }
}

function extraTagEntriesFromRows(
    rows: AudioMetaExtraTagRow[]
): ExtraNativeTagWriteEntry[] {
    return rows.map((row) => ({
        tagKey: row.tagKey,
        value: row.value,
        source: row.source
    }))
}

/**
 * 仅用文件名中的艺人 / 曲名覆盖标签（合并进现有元数据，不清空专辑等其它字段）。
 */
export async function writeFilenameTagsToFile(params: {
    filePath: string
    artist: string
    title: string
}): Promise<WriteAudioMetaResult> {
    const resolved = path.resolve(params.filePath)

    if (!isEditableAudioMetaPath(resolved)) {
        return {
            ok: false,
            filePath: resolved,
            message: '当前仅支持编辑 MP3 / FLAC 文件的标签'
        }
    }

    if (!fs.existsSync(resolved)) {
        return { ok: false, filePath: resolved, message: '文件不存在' }
    }

    const ext = fileExtensionLower(resolved)
    const artist = params.artist.trim()
    const title = params.title.trim()

    if (!title) {
        return { ok: false, filePath: resolved, message: '曲名不能为空' }
    }

    try {
        const parsed = await parseAudioFileSafe(resolved, { skipCovers: false })
        const audioData = fs.readFileSync(resolved)
        const explicit: Partial<IMusicMeta> & { artist?: string } = {
            title,
            artist
        }
        const meta = buildMusicMetaFromSources(explicit, parsed, false)

        tryWriteTaggedFile(resolved, audioData, meta, parsed, ext, false)

        return { ok: true, filePath: resolved }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, filePath: resolved, message: msg || '写入标签失败' }
    }
}

export async function writeAudioFileMeta(params: {
    filePath: string
    form: AudioMetaEditForm
    coverBase64?: string | null
    extendedNative?: AudioMetaExtraTagRow[]
    otherExtra?: AudioMetaExtraTagRow[]
    touchedExtensionFamilies?: ReadonlySet<string>
}): Promise<WriteAudioMetaResult> {
    const resolved = path.resolve(params.filePath)

    if (!isEditableAudioMetaPath(resolved)) {
        return {
            ok: false,
            filePath: resolved,
            message: '当前仅支持编辑 MP3 / FLAC 文件的标签'
        }
    }

    if (!fs.existsSync(resolved)) {
        return { ok: false, filePath: resolved, message: '文件不存在' }
    }

    const ext = fileExtensionLower(resolved)

    try {
        const audioData = fs.readFileSync(resolved)
        if (ext === 'flac') {
            const located = locateFlacInBuffer(audioData)
            if (!located) {
                return {
                    ok: false,
                    filePath: resolved,
                    message:
                        '文件已损坏或无法识别为 FLAC，请从备份恢复后再编辑'
                }
            }
        }

        let parsed: Awaited<ReturnType<typeof parseAudioFileSafe>>
        try {
            parsed = await parseAudioFileSafe(resolved, { skipCovers: false })
        } catch (parseErr) {
            if (ext === 'flac') {
                const hint =
                    parseErr instanceof Error ? parseErr.message : String(parseErr)
                return {
                    ok: false,
                    filePath: resolved,
                    message:
                        hint.includes('offset') || hint.includes('FLAC')
                            ? '文件元数据已损坏，无法安全写入，请从备份恢复后再编辑'
                            : hint || '无法读取文件标签'
                }
            }
            throw parseErr
        }
        const metaJson = editFormToMusicMetaJson(params.form, params.coverBase64)
        const preparedExtended = prepareExtendedNativeRowsForWrite(
            params.extendedNative ?? [],
            params.touchedExtensionFamilies
        )
        const mergedJson = applyExtensionRowsToMusicMeta(
            metaJson,
            preparedExtended,
            params.touchedExtensionFamilies
        )
        let meta = musicMetaFromJson(mergedJson)

        let flacCoverMode: FlacCoverWriteMode = 'preserve'
        if (ext === 'flac') {
            if (params.coverBase64 === null) {
                flacCoverMode = 'remove'
            } else if (params.coverBase64 !== undefined) {
                flacCoverMode = 'replace'
            }
        }

        if (flacCoverMode === 'replace') {
            if (typeof meta.picture === 'object' && meta.picture) {
                meta.picture = normalizeEmbedPicture(meta.picture)
            }
        } else if (ext === 'flac') {
            meta = { ...meta, picture: undefined }
        } else if (params.coverBase64 === undefined) {
            meta.picture = normalizeEmbedPicture(
                pictureArrayBufferFromParsed(parsed)
            )
        } else if (typeof meta.picture === 'object' && meta.picture) {
            meta.picture = normalizeEmbedPicture(meta.picture)
        }

        const extraRows = collectPersistedExtraTagRows(
            preparedExtended,
            params.otherExtra ?? [],
            ext as 'mp3' | 'flac'
        )
        const extraTags = extraTagEntriesFromRows(extraRows)

        let result = await writeValidatedTaggedFile(
            resolved,
            audioData,
            meta,
            parsed,
            ext,
            true,
            extraTags,
            flacCoverMode
        )

        if (!result.ok && meta.picture) {
            result = await writeValidatedTaggedFile(
                resolved,
                audioData,
                { ...meta, picture: undefined },
                parsed,
                ext,
                true,
                extraTags,
                flacCoverMode === 'replace' ? 'preserve' : flacCoverMode
            )
        }

        return result
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, filePath: resolved, message: msg || '写入标签失败' }
    }
}

/** 清理扩展原生标签中的重复项（同键多条、ARTIST/ARTISTS 别名重复等） */
export async function cleanupDuplicateExtendedTagsToFile(params: {
    filePath: string
}): Promise<WriteAudioMetaResult> {
    const resolved = path.resolve(params.filePath)

    if (!isEditableAudioMetaPath(resolved)) {
        return {
            ok: false,
            filePath: resolved,
            message: '当前仅支持编辑 MP3 / FLAC 文件的标签'
        }
    }

    if (!fs.existsSync(resolved)) {
        return { ok: false, filePath: resolved, message: '文件不存在' }
    }

    const meta = await readAudioFileMeta(resolved)
    if (!meta.ok) {
        return {
            ok: false,
            filePath: resolved,
            message: meta.message ?? '无法读取标签'
        }
    }

    const { duplicateKeys } = detectDuplicateExtendedNativeTags(meta, resolved)
    if (!duplicateKeys.length) {
        return { ok: true, filePath: resolved }
    }

    const extRows = buildExtendedNativeEditRows(meta, resolved)
    const prepared = dedupeExtendedNativeRows(extRows, {
        collapseAliasGroups: true,
        keepSingleValueWhenDuplicate: true
    })
    const touched = collectTouchedFamiliesForDuplicateGroups(extRows)

    return writeAudioFileMeta({
        filePath: resolved,
        form: metaInfoToEditForm(meta),
        extendedNative: prepared,
        touchedExtensionFamilies: touched
    })
}

/** 将扩展原生标签中的繁体字转为简体（Vorbis / ID3 扩展 Tab 全部字段） */
export async function convertTraditionalExtendedTagsToFile(params: {
    filePath: string
}): Promise<WriteAudioMetaResult> {
    const resolved = path.resolve(params.filePath)

    if (!isEditableAudioMetaPath(resolved)) {
        return {
            ok: false,
            filePath: resolved,
            message: '当前仅支持编辑 MP3 / FLAC 文件的标签'
        }
    }

    if (!fs.existsSync(resolved)) {
        return { ok: false, filePath: resolved, message: '文件不存在' }
    }

    const meta = await readAudioFileMeta(resolved)
    if (!meta.ok) {
        return {
            ok: false,
            filePath: resolved,
            message: meta.message ?? '无法读取标签'
        }
    }

    const extRows = buildExtendedNativeEditRows(meta, resolved)
    const touched = new Set<string>()
    let changed = false

    const prepared = extRows.map((row) => {
        if (!containsTraditionalChinese(row.value)) return row
        const simplified = toSimplifiedChinese(row.value)
        if (simplified === row.value) return row
        changed = true
        const token = familyTokenForTagKey(row.tagKey)
        if (token) touched.add(token)
        return { ...row, value: simplified }
    })

    if (!changed) {
        return { ok: true, filePath: resolved }
    }

    return writeAudioFileMeta({
        filePath: resolved,
        form: metaInfoToEditForm(meta),
        extendedNative: prepared,
        touchedExtensionFamilies: touched
    })
}

/** 删除 MP3 文件尾 ID3v1 / ID3v1.1 标签块（保留 ID3v2） */
export async function removeId3v1TagsFromFile(params: {
    filePath: string
}): Promise<WriteAudioMetaResult> {
    const resolved = path.resolve(params.filePath)

    if (fileExtensionLower(resolved) !== 'mp3') {
        return {
            ok: false,
            filePath: resolved,
            message: '仅 MP3 文件含有 ID3v1 标签'
        }
    }

    if (!fs.existsSync(resolved)) {
        return { ok: false, filePath: resolved, message: '文件不存在' }
    }

    const audioData = fs.readFileSync(resolved)
    const stripped = stripId3v1FromMp3Buffer(audioData)
    if (stripped.length === audioData.length) {
        return { ok: true, filePath: resolved }
    }

    const tmpPath = `${resolved}.songvault-id3v1-tmp`
    try {
        fs.writeFileSync(tmpPath, stripped)
        await parseFile(tmpPath, { skipCovers: true, duration: false })
        fs.renameSync(tmpPath, resolved)
        return { ok: true, filePath: resolved }
    } catch (err) {
        try {
            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
        } catch {
            /* ignore */
        }
        const msg = err instanceof Error ? err.message : String(err)
        return {
            ok: false,
            filePath: resolved,
            message: msg || '删除 ID3v1 后校验失败，原文件未改动'
        }
    }
}
