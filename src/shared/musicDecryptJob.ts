/**
 * 音乐解密：主进程读写与批量任务类型。
 * 解密算法在渲染进程调用 unlock-music。
 */

import fs from 'fs'
import path from 'path'

export interface ReadMusicFileResult {
  fileName: string
  /** 文件字节（IPC structured clone 支持 Uint8Array） */
  data: Uint8Array
}

export interface WriteDecryptedMusicParams {
  outputDir: string
  fileName: string
  data: Uint8Array
}

export interface WriteDecryptedMusicResult {
  outputPath: string
}

export interface MusicDecryptFileOutcome {
  inputPath: string
  ok: boolean
  outputPath?: string
  title?: string
  message?: string
}

export interface MusicDecryptBatchResult {
  outcomes: MusicDecryptFileOutcome[]
  succeeded: number
  failed: number
}

function uniqueOutputPath(dir: string, fileName: string): string {
  const safeName = path.basename(fileName)
  let target = path.join(dir, safeName)
  if (!fs.existsSync(target)) return target
  const parsed = path.parse(safeName)
  let n = 1
  while (fs.existsSync(target)) {
    target = path.join(dir, `${parsed.name} (${n})${parsed.ext}`)
    n++
  }
  return target
}

export function readMusicFile(filePath: string): ReadMusicFileResult {
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved)) {
    throw new Error(`文件不存在: ${resolved}`)
  }
  const stat = fs.statSync(resolved)
  if (!stat.isFile()) {
    throw new Error(`不是文件: ${resolved}`)
  }
  const buf = fs.readFileSync(resolved)
  return {
    fileName: path.basename(resolved),
    data: new Uint8Array(buf)
  }
}

export function writeDecryptedMusic(
  params: WriteDecryptedMusicParams
): WriteDecryptedMusicResult {
  const outputDir = path.resolve(params.outputDir)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }
  const stat = fs.statSync(outputDir)
  if (!stat.isDirectory()) {
    throw new Error(`保存路径不是文件夹: ${outputDir}`)
  }
  const outPath = uniqueOutputPath(outputDir, params.fileName)
  fs.writeFileSync(outPath, Buffer.from(params.data))
  return { outputPath: outPath }
}
