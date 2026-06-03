import { isPlainAudioFilePath } from './isAudioFilePath'
import { isDecryptableExtension } from './musicFormats'
import { fileExtensionLower } from './pathLite'

/** 是否可用内置播放器直接播放（已解密的普通音频） */
export function canPlayAudioFilePath(filePath: string): boolean {
    return isPlainAudioFilePath(filePath)
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
