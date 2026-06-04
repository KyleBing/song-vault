import { Decrypt } from '@unlock/decrypt'
import type { DecryptResult, FileInfo } from '@unlock/decrypt/entity'
import { embedDecryptMetadata } from '@unlock/decrypt/utils'
import {
  FilenamePolicy,
  GetDownloadFilename,
  RemoveBlobMusic
} from '@unlock/utils/utils'
import type {
  MusicDecryptBatchResult,
  MusicDecryptFileOutcome
} from '@shared/musicDecryptJob'

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'NotReadableError') {
      return '内存不足，无法读取音频数据（批量解密时偶发，请减少单次数量或稍后重试）'
    }
    return err.message
  }
  const text = String(err)
  if (text.includes('could not be read')) {
    return '内存不足，无法读取音频数据（批量解密时偶发，请减少单次数量或稍后重试）'
  }
  return text
}

/** 将磁盘文件解密并写入输出目录 */
export async function decryptMusicFileToDir(
  filePath: string,
  outputDir: string,
  config: Record<string, unknown>
): Promise<MusicDecryptFileOutcome> {
  let result: DecryptResult | undefined
  try {
    const { fileName, data } = await window.electronAPI.readMusicFile(filePath)
    // 独立拷贝，避免 IPC 缓冲区与 File 共享 backing store
    const inputCopy = new Uint8Array(data)
    const file = new File([inputCopy], fileName)
    const fileInfo: FileInfo = {
      status: 'ready',
      name: fileName,
      size: inputCopy.byteLength,
      percentage: 0,
      uid: Date.now(),
      raw: file
    }
    const decrypted = await Decrypt(fileInfo, config)
    result = await embedDecryptMetadata(decrypted)
    const outName = GetDownloadFilename(result, FilenamePolicy.SameAsOriginal)
    const title = result.title
    const audioBuffer = await result.blob.arrayBuffer()
    RemoveBlobMusic(result)
    result = undefined
    const { outputPath } = await window.electronAPI.writeDecryptedMusic({
      outputDir,
      fileName: outName,
      data: new Uint8Array(audioBuffer)
    })
    return {
      inputPath: filePath,
      ok: true,
      outputPath,
      title
    }
  } catch (err) {
    if (result) RemoveBlobMusic(result)
    return {
      inputPath: filePath,
      ok: false,
      message: toErrorMessage(err)
    }
  }
}

/** 顺序批量解密（避免同时占用过多内存） */
export async function decryptMusicBatch(
  filePaths: string[],
  outputDir: string,
  config: Record<string, unknown>,
  onProgress?: (done: number, total: number) => void,
  cancelCheck?: () => void
): Promise<MusicDecryptBatchResult> {
  const outcomes: MusicDecryptFileOutcome[] = []
  const total = filePaths.length
  let done = 0
  for (const filePath of filePaths) {
    cancelCheck?.()
    outcomes.push(await decryptMusicFileToDir(filePath, outputDir, config))
    done++
    onProgress?.(done, total)
    // 让出事件循环，便于 GC 回收上一首的 Blob / ArrayBuffer
    await new Promise<void>((resolve) =>
      setTimeout(resolve, done % 20 === 0 ? 80 : 0)
    )
  }
  const succeeded = outcomes.filter((o) => o.ok).length
  return {
    outcomes,
    succeeded,
    failed: outcomes.length - succeeded
  }
}
