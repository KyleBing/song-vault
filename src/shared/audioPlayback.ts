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
