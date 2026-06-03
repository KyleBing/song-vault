/**
 * 顶栏播放器状态：单例 HTMLAudioElement，通过主进程 songvault-media 协议加载本地文件。
 * 进度条拖动在 AppAudioPlayer 中处理，松手后调用 seek。
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
    canPlayAudioFilePath,
    playBlockedReason
} from '@shared/audioPlayback'

/** 从路径取文件名，用于顶栏标题 */
function fileBaseName(filePath: string): string {
    const base = filePath.replace(/[/\\]+$/, '')
    const slash = Math.max(base.lastIndexOf('/'), base.lastIndexOf('\\'))
    return slash >= 0 ? base.slice(slash + 1) : base
}

function toErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message
    return String(err)
}

/** 将 media 元素 error 码转为用户可读文案 */
function mediaErrorDetail(audio: HTMLAudioElement): string {
    const code = audio.error?.code
    if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
        return '无法播放该文件（格式或路径受限）'
    }
    if (code === MediaError.MEDIA_ERR_NETWORK) {
        return '无法读取音频文件'
    }
    return '无法播放该文件'
}

/** 全局唯一 audio 实例，避免重复创建与事件重复绑定 */
let audioEl: HTMLAudioElement | null = null

/**
 * 设置 src 后等待可播放；避免在未 canplay 时调用 play() 失败。
 */
function waitForCanPlay(audio: HTMLAudioElement, timeoutMs = 15000): Promise<void> {
    if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        return Promise.resolve()
    }
    return new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => {
            cleanup()
            reject(new Error('加载音频超时'))
        }, timeoutMs)
        const onReady = () => {
            cleanup()
            resolve()
        }
        const onErr = () => {
            cleanup()
            reject(new Error(mediaErrorDetail(audio)))
        }
        const cleanup = () => {
            window.clearTimeout(timer)
            audio.removeEventListener('canplay', onReady)
            audio.removeEventListener('error', onErr)
        }
        audio.addEventListener('canplay', onReady, { once: true })
        audio.addEventListener('error', onErr, { once: true })
        audio.load()
    })
}

export const useAudioPlayerStore = defineStore('audioPlayer', () => {
    const filePath = ref<string | null>(null)
    const title = ref('')
    const playing = ref(false)
    const loading = ref(false)
    const duration = ref(0)
    const currentTime = ref(0)
    const lastError = ref<string | null>(null)

    const hasTrack = computed(() => !!filePath.value)

    /** 懒创建 audio 并绑定进度/状态同步到 store */
    function ensureAudio(): HTMLAudioElement {
        if (audioEl) return audioEl
        const audio = new Audio()
        audio.addEventListener('loadedmetadata', () => {
            duration.value = Number.isFinite(audio.duration) ? audio.duration : 0
        })
        audio.addEventListener('durationchange', () => {
            duration.value = Number.isFinite(audio.duration) ? audio.duration : 0
        })
        audio.addEventListener('timeupdate', () => {
            currentTime.value = audio.currentTime
        })
        audio.addEventListener('play', () => {
            playing.value = true
            lastError.value = null
        })
        audio.addEventListener('pause', () => {
            playing.value = false
        })
        audio.addEventListener('ended', () => {
            playing.value = false
            currentTime.value = 0
        })
        audio.addEventListener('error', () => {
            playing.value = false
            loading.value = false
            lastError.value = mediaErrorDetail(audio)
        })
        audioEl = audio
        return audio
    }

    /** 播放指定路径；加密格式由 playBlockedReason 拦截 */
    async function play(targetPath: string): Promise<void> {
        const resolved = targetPath.trim()
        const blocked = playBlockedReason(resolved)
        if (blocked) {
            lastError.value = blocked
            return
        }

        loading.value = true
        lastError.value = null
        try {
            const url = await window.electronAPI.pathToMediaUrl(resolved)
            const audio = ensureAudio()

            if (audio.src !== url) {
                audio.pause()
                audio.src = url
                filePath.value = resolved
                title.value = fileBaseName(resolved)
                currentTime.value = 0
                duration.value = 0
            }

            await waitForCanPlay(audio)
            await audio.play()
        } catch (err) {
            lastError.value = toErrorMessage(err)
            playing.value = false
        } finally {
            loading.value = false
        }
    }

    function pause(): void {
        audioEl?.pause()
    }

    /** 顶栏播放/暂停：已缓冲则直接 play，否则重新走 play 加载 */
    async function toggle(): Promise<void> {
        if (!filePath.value) return
        if (playing.value) {
            pause()
            return
        }
        if (canPlayAudioFilePath(filePath.value)) {
            const audio = ensureAudio()
            if (audio.src && audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
                try {
                    await audio.play()
                    return
                } catch {
                    /* 回退到重新加载 */
                }
            }
        }
        await play(filePath.value)
    }

    /** ratio ∈ [0, 1]，由 AppAudioPlayer 在拖动结束后调用 */
    function seek(ratio: number): void {
        const audio = audioEl
        if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) {
            return
        }
        const clamped = Math.min(1, Math.max(0, ratio))
        audio.currentTime = clamped * audio.duration
        currentTime.value = audio.currentTime
    }

    /** 应用卸载时释放 audio，清空 src 避免后台继续解码 */
    function dispose(): void {
        if (audioEl) {
            audioEl.pause()
            audioEl.removeAttribute('src')
            audioEl.load()
            audioEl = null
        }
        playing.value = false
    }

    return {
        filePath,
        title,
        playing,
        loading,
        duration,
        currentTime,
        lastError,
        hasTrack,
        play,
        pause,
        toggle,
        seek,
        dispose
    }
})
