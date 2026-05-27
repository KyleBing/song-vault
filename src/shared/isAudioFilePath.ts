import { AUDIO_EXTENSIONS } from './lrcJob'
import { isDecryptableExtension } from './musicFormats'
import { fileExtensionLower } from './pathLite'

/** 是否为可展示元数据悬停的普通音频扩展名 */
export function isPlainAudioFilePath(filePath: string): boolean {
  return AUDIO_EXTENSIONS.has(fileExtensionLower(filePath))
}

/** 是否为加密音乐或普通音频（均可显示悬停，加密时仅提示） */
export function isMusicFilePathForMetaHover(filePath: string): boolean {
  const ext = fileExtensionLower(filePath)
  return AUDIO_EXTENSIONS.has(ext) || isDecryptableExtension(ext)
}
