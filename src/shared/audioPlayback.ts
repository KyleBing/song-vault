import { isPlainAudioFilePath } from './isAudioFilePath'
import { isDecryptableExtension } from './musicFormats'
import { fileExtensionLower } from './pathLite'

/** 扩展名 → MIME，供媒体协议与 <audio> 提示解码器走音频管线 */
const AUDIO_MIME_BY_EXT: Record<string, string> = {
    mp3: 'audio/mpeg',
    flac: 'audio/flac',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
    opus: 'audio/opus',
    wav: 'audio/wav',
    wma: 'audio/x-ms-wma',
    ape: 'audio/ape',
    alac: 'audio/mp4',
    aiff: 'audio/aiff',
    aif: 'audio/aiff',
    dsf: 'audio/dsf',
    dff: 'audio/x-dff',
    wv: 'audio/x-wavpack',
    mpc: 'audio/x-musepack',
    mp4: 'audio/mp4',
    mkv: 'audio/x-matroska'
}

/** 是否可用内置播放器直接播放（已解密的普通音频） */
export function canPlayAudioFilePath(filePath: string): boolean {
    return isPlainAudioFilePath(filePath)
}

/** 本地音频文件的 MIME 类型（未知扩展名时回退 audio/mpeg） */
export function audioMimeTypeForFilePath(filePath: string): string {
    const ext = fileExtensionLower(filePath)
    return AUDIO_MIME_BY_EXT[ext] ?? 'audio/mpeg'
}

/** 不可播放时的说明；可播放则返回 null */
export function playBlockedReason(filePath: string): string | null {
    const key = filePath.trim()
    if (!key) return '无效路径'
    if (canPlayAudioFilePath(key)) return null
    const ext = fileExtensionLower(key)
    if (isDecryptableExtension(ext)) {
        return '加密格式需先解密后才能播放'
    }
    return '不支持播放此格式'
}

/** 内置 Chromium 播放器通常无法解码的编码 → 用户提示 */
export function playbackBlockedByCodec(
    codec: string | undefined,
    ext: string
): string | null {
    if (!codec?.trim()) return null

    const normalized = codec.trim().toUpperCase()
    const extension = ext.toLowerCase()

    if (normalized === 'ALAC' || normalized.includes('APPLE LOSSLESS')) {
        return 'ALAC 无损 M4A/MP4 无法用内置播放器解码，请转为 AAC、FLAC 或 MP3 后播放'
    }
    if (
        normalized === 'WMA' ||
        normalized.includes('WINDOWS MEDIA') ||
        extension === 'wma'
    ) {
        return 'WMA 无法用内置播放器解码，请转为 MP3 或 FLAC'
    }
    if (normalized === 'APE' || normalized.includes('MONKEY')) {
        return 'APE 无法用内置播放器解码，请转为 FLAC 或 MP3'
    }
    if (
        normalized === 'DSD' ||
        extension === 'dsf' ||
        extension === 'dff'
    ) {
        return 'DSD 无法用内置播放器解码'
    }
    if (normalized === 'MUSEPACK' || normalized === 'MPC' || extension === 'mpc') {
        return 'Musepack (MPC) 无法用内置播放器解码，请转为 MP3 或 FLAC'
    }
    if (normalized === 'WAVPACK' || extension === 'wv') {
        return 'WavPack 无法用内置播放器解码，请转为 FLAC 或 MP3'
    }

    return null
}

/** HTMLMediaElement.error.code 常量（与浏览器一致） */
export const MEDIA_ERR_ABORTED = 1
export const MEDIA_ERR_NETWORK = 2
export const MEDIA_ERR_DECODE = 3
export const MEDIA_ERR_SRC_NOT_SUPPORTED = 4

/** 播放失败时的用户可读说明（结合编码与 media error） */
export function formatMediaPlaybackError(
    mediaErrorCode: number | undefined,
    options: { codec?: string; ext?: string } = {}
): string {
    const codecHint = options.ext
        ? playbackBlockedByCodec(options.codec, options.ext)
        : null
    if (codecHint) return codecHint

    if (mediaErrorCode === MEDIA_ERR_SRC_NOT_SUPPORTED) {
        return '无法播放该文件（内置播放器不支持此编码，可尝试转为 MP3 / FLAC / AAC）'
    }
    if (mediaErrorCode === MEDIA_ERR_NETWORK) {
        return '无法读取音频文件'
    }
    if (mediaErrorCode === MEDIA_ERR_DECODE) {
        return '无法解码该文件（可能是不支持的编码或文件已损坏）'
    }
    return '无法播放该文件'
}
