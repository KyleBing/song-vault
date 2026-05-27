import path from 'path'
import { parseFile, type IAudioMetadata } from 'music-metadata'
import {
  emptyAudioFileMeta,
  recordFromMetaObject,
  type AudioFileMetaInfo,
  type AudioNativeTagEntry
} from './audioFileMeta'
import { AUDIO_EXTENSIONS } from './lrcJob'
import { isDecryptableExtension } from './musicFormats'

function coverDataUrlFromMeta(meta: IAudioMetadata): string | undefined {
  const pic = meta.common.picture?.[0]
  if (!pic?.data?.length) return undefined
  const mime = pic.format?.trim() || 'image/jpeg'
  const base64 = Buffer.from(pic.data).toString('base64')
  return `data:${mime};base64,${base64}`
}

function nativeTagsFromMeta(meta: IAudioMetadata): AudioNativeTagEntry[] {
  const out: AudioNativeTagEntry[] = []
  const native = meta.native
  if (!native) return out
  for (const [formatId, tags] of Object.entries(native)) {
    for (const tag of tags) {
      const value =
        typeof tag.value === 'string'
          ? tag.value.trim()
          : tag.value === null || tag.value === undefined
            ? ''
            : String(tag.value)
      if (!value) continue
      out.push({
        id: `${formatId}:${tag.id}`,
        value
      })
    }
  }
  return out
}

/** 读取单个音频文件的完整标签与格式信息 */
export async function readAudioFileMeta(
  filePath: string
): Promise<AudioFileMetaInfo> {
  const resolved = path.resolve(filePath)
  const ext = path.extname(resolved).slice(1).toLowerCase()

  if (isDecryptableExtension(ext)) {
    return emptyAudioFileMeta(resolved, '加密格式，需解密后才能查看标签')
  }

  if (!AUDIO_EXTENSIONS.has(ext)) {
    return emptyAudioFileMeta(resolved, '非音频文件')
  }

  try {
    const meta = await parseFile(resolved, {
      skipCovers: false,
      duration: true
    })
    return {
      filePath: resolved,
      ok: true,
      coverDataUrl: coverDataUrlFromMeta(meta),
      common: recordFromMetaObject(
        meta.common as unknown as Record<string, unknown>
      ),
      format: recordFromMetaObject(
        meta.format as unknown as Record<string, unknown>
      ),
      native: nativeTagsFromMeta(meta)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return emptyAudioFileMeta(resolved, msg || '无法解析元数据')
  }
}

const DEFAULT_CONCURRENCY = 4

/** 批量读取元数据（限制并发） */
export async function readAudioFileMetaBatch(
  filePaths: string[],
  concurrency = DEFAULT_CONCURRENCY
): Promise<Record<string, AudioFileMetaInfo>> {
  const unique = [...new Set(filePaths.filter(Boolean))]
  const out: Record<string, AudioFileMetaInfo> = {}
  if (unique.length === 0) return out

  let index = 0
  async function worker(): Promise<void> {
    while (index < unique.length) {
      const i = index++
      const p = unique[i]!
      out[p] = await readAudioFileMeta(p)
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, unique.length) },
    () => worker()
  )
  await Promise.all(workers)
  return out
}
