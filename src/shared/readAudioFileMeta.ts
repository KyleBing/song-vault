import fs from 'fs'
import path from 'path'
import { checkBatchCancelled } from './batchCancel'
import type { IAudioMetadata } from 'music-metadata'
import { readFirstFlacCoverDataUrl } from '../unlock-music/decrypt/flacRewrite'
import { parseAudioFileSafe } from './parseAudioFileSafe'
import {
  emptyAudioFileMeta,
  formatNativeTagValue,
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
      const fullId = `${formatId}:${tag.id}`
      const value =
        formatNativeTagValue(fullId, tag.value) ??
        formatNativeTagValue(tag.id, tag.value)
      if (!value) continue
      out.push({ id: fullId, value })
    }
  }
  return out
}

function readFileSizeBytes(filePath: string): number | undefined {
  try {
    const n = Number(fs.statSync(filePath).size)
    return Number.isFinite(n) && n >= 0 ? n : undefined
  } catch {
    return undefined
  }
}

export interface ReadAudioFileMetaOptions {
    /** 跳过封面解析（扫描批量对比时更快） */
    skipCovers?: boolean
    /** 跳过时长解析 */
    duration?: boolean
    /** FLAC 封面 fallback 会读整文件，扫描时应关闭 */
    includeCoverFallback?: boolean
}

/** 扫描对比用：只读标签文本，不解析封面/时长 */
export const READ_AUDIO_META_FOR_SCAN: ReadAudioFileMetaOptions = {
    skipCovers: true,
    duration: false,
    includeCoverFallback: false
}

/** 读取单个音频文件的完整标签与格式信息 */
export async function readAudioFileMeta(
  filePath: string,
  options: ReadAudioFileMetaOptions = {}
): Promise<AudioFileMetaInfo> {
  const skipCovers = options.skipCovers ?? false
  const duration = options.duration ?? true
  const includeCoverFallback = options.includeCoverFallback ?? !skipCovers
  const resolved = path.resolve(filePath)
  const ext = path.extname(resolved).slice(1).toLowerCase()
  const fileSizeBytes = readFileSizeBytes(resolved)

  if (isDecryptableExtension(ext)) {
    return { ...emptyAudioFileMeta(resolved, '加密格式，需解密后才能查看标签'), fileSizeBytes }
  }

  if (!AUDIO_EXTENSIONS.has(ext)) {
    return { ...emptyAudioFileMeta(resolved, '非音频文件'), fileSizeBytes }
  }

  try {
    checkBatchCancelled()
    const meta = await parseAudioFileSafe(resolved, {
      skipCovers,
      duration
    })
    checkBatchCancelled()
    let coverDataUrl = skipCovers ? undefined : coverDataUrlFromMeta(meta)
    if (!coverDataUrl && includeCoverFallback && ext === 'flac') {
      coverDataUrl = readFirstFlacCoverDataUrl(fs.readFileSync(resolved))
    }
    return {
      filePath: resolved,
      ok: true,
      fileSizeBytes,
      coverDataUrl,
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
    const friendly =
      msg.includes('offset') && msg.includes('out of range')
        ? '文件元数据已损坏，请从备份恢复后再查看或编辑'
        : msg || '无法解析元数据'
    return { ...emptyAudioFileMeta(resolved, friendly), fileSizeBytes }
  }
}

const DEFAULT_CONCURRENCY = 4

/** 批量读取元数据（限制并发） */
export async function readAudioFileMetaBatch(
  filePaths: string[],
  concurrency = DEFAULT_CONCURRENCY,
  onProgress?: (done: number, total: number) => void,
  readOptions: ReadAudioFileMetaOptions = {}
): Promise<Record<string, AudioFileMetaInfo>> {
  const unique = [...new Set(filePaths.filter(Boolean))]
  const out: Record<string, AudioFileMetaInfo> = {}
  if (unique.length === 0) return out

  const total = unique.length
  let done = 0
  onProgress?.(0, total)

  let index = 0
  let aborted = false

  async function worker(): Promise<void> {
    while (index < unique.length) {
      if (aborted) return
      try {
        checkBatchCancelled()
      } catch (err) {
        aborted = true
        throw err
      }
      const i = index++
      if (i >= unique.length) break
      const p = unique[i]!
      const meta = await readAudioFileMeta(p, readOptions)
      if (aborted) return
      try {
        checkBatchCancelled()
      } catch (err) {
        aborted = true
        throw err
      }
      out[p] = meta
      out[path.resolve(p)] = meta
      done += 1
      onProgress?.(done, total)
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, unique.length) },
    () => worker()
  )
  try {
    await Promise.all(workers)
  } catch (err) {
    aborted = true
    throw err
  }
  return out
}
