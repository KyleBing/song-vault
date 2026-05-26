import { Decrypt } from '@unlock/decrypt'
import type { FileInfo } from '@unlock/decrypt/entity'
import {
  FilenamePolicy,
  GetDownloadFilename
} from '@unlock/utils/utils'
import type { MusicDecryptBatchResult, MusicDecryptFileOutcome } from '@shared/musicDecryptJob'

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

/** 将磁盘文件解密并写入输出目录 */
export async function decryptMusicFileToDir(
  filePath: string,
  outputDir: string,
  config: Record<string, unknown>
): Promise<MusicDecryptFileOutcome> {
  try {
    const { fileName, data } = await window.electronAPI.readMusicFile(filePath)
    const file = new File([new Uint8Array(data)], fileName)
    const fileInfo: FileInfo = {
      status: 'ready',
      name: fileName,
      size: data.byteLength,
      percentage: 0,
      uid: Date.now(),
      raw: file
    }
    const result = await Decrypt(fileInfo, config)
    const outName = GetDownloadFilename(result, FilenamePolicy.ArtistAndTitle)
    const audioBuffer = await result.blob.arrayBuffer()
    const { outputPath } = await window.electronAPI.writeDecryptedMusic({
      outputDir,
      fileName: outName,
      data: new Uint8Array(audioBuffer)
    })
    if (result.file.startsWith('blob:')) {
      URL.revokeObjectURL(result.file)
    }
    return {
      inputPath: filePath,
      ok: true,
      outputPath,
      title: result.title
    }
  } catch (err) {
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
  onProgress?: (done: number, total: number) => void
): Promise<MusicDecryptBatchResult> {
  const outcomes: MusicDecryptFileOutcome[] = []
  const total = filePaths.length
  let done = 0
  for (const filePath of filePaths) {
    outcomes.push(await decryptMusicFileToDir(filePath, outputDir, config))
    done++
    onProgress?.(done, total)
  }
  const succeeded = outcomes.filter((o) => o.ok).length
  return {
    outcomes,
    succeeded,
    failed: outcomes.length - succeeded
  }
}
