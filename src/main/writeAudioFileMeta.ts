import fs from 'fs'
import path from 'path'
import { parseFile } from 'music-metadata'
import {
    WriteMetaToFlac,
    WriteMetaToMp3,
    type IMusicMeta
} from '../unlock-music/decrypt/utils'
import {
    editFormToMusicMetaJson,
    isEditableAudioMetaPath,
    type AudioMetaEditForm,
    type WriteAudioMetaResult
} from '../shared/audioMetaEdit'
import { fileExtensionLower } from '../shared/pathLite'

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
        const meta = musicMetaFromJson(metaJson)

        if (params.coverBase64 === undefined && parsed.common.picture?.[0]?.data) {
            meta.picture = Uint8Array.from(parsed.common.picture[0].data).buffer
        }

        const tagged =
            ext === 'mp3'
                ? WriteMetaToMp3(audioData, meta, parsed, true)
                : WriteMetaToFlac(audioData, meta, parsed, true)

        fs.writeFileSync(resolved, tagged)

        return { ok: true, filePath: resolved }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, filePath: resolved, message: msg || '写入标签失败' }
    }
}
