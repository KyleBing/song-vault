import { existsSync, statSync } from 'fs'
import path from 'path'
import { canPlayAudioFilePath } from './audioPlayback'
import { buildSongvaultMediaUrl } from './mediaProtocolUrl'

/** 将本地可播放音频路径转为渲染进程 <audio> 可加载的 URL */
export function resolvePathToMediaUrl(filePath: string): string {
    const resolved = path.resolve(String(filePath))
    if (!existsSync(resolved)) {
        throw new Error(`文件不存在: ${resolved}`)
    }
    const st = statSync(resolved)
    if (!st.isFile()) {
        throw new Error(`不是文件: ${resolved}`)
    }
    if (!canPlayAudioFilePath(resolved)) {
        throw new Error('该格式无法直接播放')
    }
    return buildSongvaultMediaUrl(resolved)
}
