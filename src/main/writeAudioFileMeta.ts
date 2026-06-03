import fs from 'fs'
import path from 'path'
import { parseFile } from 'music-metadata'
import {
    WriteMetaToFlac,
    WriteMetaToMp3,
    buildMusicMetaFromSources,
    type IMusicMeta
} from '../unlock-music/decrypt/utils'
import {
    editFormToMusicMetaJson,
    isEditableAudioMetaPath,
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

function writeTaggedBuffer(
    audioData: Buffer,
    meta: IMusicMeta,
    parsed: Awaited<ReturnType<typeof parseFile>>,
    ext: string,
    replaceExisting: boolean
): Buffer {
    return ext === 'mp3'
        ? WriteMetaToMp3(audioData, meta, parsed, replaceExisting)
        : WriteMetaToFlac(audioData, meta, parsed, replaceExisting)
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
        const parsed = await parseFile(resolved, { skipCovers: false })
        const audioData = fs.readFileSync(resolved)
        const explicit: Partial<IMusicMeta> & { artist?: string } = {
            title,
            artist
        }
        let meta = buildMusicMetaFromSources(explicit, parsed, false)
        meta.picture = normalizeEmbedPicture(
            pictureArrayBufferFromParsed(parsed)
        )

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
        const parsed = await parseFile(resolved, { skipCovers: false })
        const audioData = fs.readFileSync(resolved)
        const metaJson = editFormToMusicMetaJson(params.form, params.coverBase64)
        let meta = musicMetaFromJson(metaJson)

        if (params.coverBase64 === undefined) {
            meta.picture = normalizeEmbedPicture(
                pictureArrayBufferFromParsed(parsed)
            )
        } else if (typeof meta.picture === 'object' && meta.picture) {
            meta.picture = normalizeEmbedPicture(meta.picture)
        }

        tryWriteTaggedFile(resolved, audioData, meta, parsed, ext, true)

        return { ok: true, filePath: resolved }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, filePath: resolved, message: msg || '写入标签失败' }
    }
}
