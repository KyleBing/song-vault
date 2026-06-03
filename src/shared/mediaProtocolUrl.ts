/** 本地音频播放自定义协议（绕过 dev 下 http 页面无法加载 file:// 的限制） */
export const SONGVAULT_MEDIA_SCHEME = 'songvault-media'

/** 已校验的绝对路径 → 媒体 URL */
export function buildSongvaultMediaUrl(resolvedAbsolutePath: string): string {
    return `${SONGVAULT_MEDIA_SCHEME}://local?path=${encodeURIComponent(resolvedAbsolutePath)}`
}
