import { existsSync, statSync } from 'fs'
import path from 'path'
import { protocol } from 'electron'
import {
    audioMimeTypeForFilePath,
    canPlayAudioFilePath
} from '../shared/audioPlayback'
import {
    buildSongvaultMediaUrl,
    SONGVAULT_MEDIA_SCHEME
} from '../shared/mediaProtocolUrl'

export { SONGVAULT_MEDIA_SCHEME }

/** 须在 app.ready 之前调用 */
export function registerMediaProtocolSchemes(): void {
    protocol.registerSchemesAsPrivileged([
        {
            scheme: SONGVAULT_MEDIA_SCHEME,
            privileges: {
                standard: true,
                secure: true,
                stream: true,
                bypassCSP: true
            }
        }
    ])
}

/** 须在 app.whenReady 之后、创建窗口之前或之后尽早调用 */
export function registerMediaProtocolHandler(): void {
    protocol.registerFileProtocol(SONGVAULT_MEDIA_SCHEME, (request, callback) => {
        try {
            const u = new URL(request.url)
            const raw = u.searchParams.get('path')
            if (!raw) {
                callback({ error: -6 })
                return
            }
            const resolved = path.resolve(decodeURIComponent(raw))
            if (!existsSync(resolved) || !statSync(resolved).isFile()) {
                callback({ error: -6 })
                return
            }
            if (!canPlayAudioFilePath(resolved)) {
                callback({ error: -10 })
                return
            }
            callback({
                path: resolved,
                mimeType: audioMimeTypeForFilePath(resolved)
            })
        } catch (err) {
            console.error('[media-protocol]', err)
            callback({ error: -2 })
        }
    })
}

/** 校验路径并生成供 <audio> 使用的 URL */
export function resolveMediaPlaybackUrl(filePath: string): string {
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
