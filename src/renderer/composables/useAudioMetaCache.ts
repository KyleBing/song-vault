import { ref } from 'vue'
import type { AudioFileMetaInfo } from '@shared/audioFileMeta'

const cache = new Map<string, AudioFileMetaInfo>()
const inflight = new Map<string, Promise<AudioFileMetaInfo>>()

/** 按路径缓存音频元数据，避免重复 IPC */
export function useAudioMetaCache() {
  const loadingCount = ref(0)

  async function getMeta(filePath: string): Promise<AudioFileMetaInfo> {
    const key = filePath.trim()
    if (!key) {
      return {
        filePath: key,
        ok: false,
        message: '无效路径',
        common: {},
        format: {},
        native: []
      }
    }

    const cached = cache.get(key)
    if (cached) return cached

    const pending = inflight.get(key)
    if (pending) return pending

    loadingCount.value += 1
    const promise = window.electronAPI
      .readAudioMeta(key)
      .then((meta) => {
        cache.set(key, meta)
        return meta
      })
      .finally(() => {
        inflight.delete(key)
        loadingCount.value -= 1
      })

    inflight.set(key, promise)
    return promise
  }

  function clearCache(): void {
    cache.clear()
    inflight.clear()
  }

  return { getMeta, clearCache, loadingCount }
}
