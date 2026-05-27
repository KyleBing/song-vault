/**
 * 扫描待解码源目录：识别网易云 / QQ 加密文件与明文 MP3，并检测同级 LRC。
 */

import fs from 'fs'
import path from 'path'
import {
  classifyEncryptedExtension,
  type MusicPlatform
} from './musicFormats'
import type { PathFilterRule } from './pathFilters'
import { shouldFilterEntry } from './pathFilters'

export interface MusicFileLrcInfo {
  hasLrc: boolean
  lrcPath?: string
}

export interface EncryptedMusicItem extends MusicFileLrcInfo {
  filePath: string
  fileName: string
  destDir: string
  platform: MusicPlatform
  ext: string
}

export interface PlainMp3Item extends MusicFileLrcInfo {
  filePath: string
  fileName: string
  destDir: string
}

export interface MusicScanStats {
  encryptedTotal: number
  neteaseCount: number
  qqCount: number
  plainMp3Total: number
  withLrc: number
  withoutLrc: number
}

export interface MusicScanResult {
  encrypted: EncryptedMusicItem[]
  plainMp3: PlainMp3Item[]
  stats: MusicScanStats
  empty: boolean
}

export interface ScanMusicDecodeParams {
  decodeSourceDirs: string[]
  pathFilterRules: PathFilterRule[]
}

function normName(name: string): string {
  return name.toLowerCase()
}

/** 同级目录是否存在与 baseName 同名的 .lrc */
function siblingLrcInfo(dir: string, baseName: string): MusicFileLrcInfo {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return { hasLrc: false }
  }

  const key = normName(baseName)
  for (const ent of entries) {
    if (!ent.isFile()) continue
    const parsed = path.parse(ent.name)
    if (normName(parsed.name) !== key) continue
    if (parsed.ext.slice(1).toLowerCase() === 'lrc') {
      return { hasLrc: true, lrcPath: path.join(dir, ent.name) }
    }
  }
  return { hasLrc: false }
}

function walkDecodeRoots(
  roots: string[],
  pathFilterRules: PathFilterRule[],
  onFile: (filePath: string, dir: string, fileName: string, ext: string) => void
): void {
  function walk(dir: string): void {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`Warning: cannot read ${dir}: ${msg}`)
      return
    }

    for (const ent of entries) {
      if (shouldFilterEntry(ent.name, ent.isDirectory(), pathFilterRules)) {
        continue
      }
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        walk(full)
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).slice(1).toLowerCase()
        onFile(full, dir, ent.name, ext)
      }
    }
  }

  for (const root of roots) {
    const resolved = path.resolve(root)
    if (!fs.existsSync(resolved)) {
      throw new Error(`目录不存在: ${root}`)
    }
    if (!fs.statSync(resolved).isDirectory()) {
      throw new Error(`不是文件夹: ${root}`)
    }
    walk(resolved)
  }
}

export function scanMusicDecode(
  params: ScanMusicDecodeParams
): MusicScanResult {
  const roots = params.decodeSourceDirs.map((d) => d.trim()).filter(Boolean)
  if (roots.length === 0) {
    return {
      encrypted: [],
      plainMp3: [],
      stats: {
        encryptedTotal: 0,
        neteaseCount: 0,
        qqCount: 0,
        plainMp3Total: 0,
        withLrc: 0,
        withoutLrc: 0
      },
      empty: true
    }
  }

  const encrypted: EncryptedMusicItem[] = []
  const plainMp3: PlainMp3Item[] = []

  walkDecodeRoots(roots, params.pathFilterRules, (filePath, dir, fileName, ext) => {
    const baseName = path.parse(fileName).name
    const lrc = siblingLrcInfo(dir, baseName)

    const platform = classifyEncryptedExtension(ext)
    if (platform) {
      encrypted.push({
        filePath,
        fileName,
        destDir: dir,
        platform,
        ext,
        ...lrc
      })
      return
    }

    if (ext === 'mp3') {
      plainMp3.push({
        filePath,
        fileName,
        destDir: dir,
        ...lrc
      })
    }
  })

  const sortByPath = <T extends { filePath: string }>(a: T, b: T) =>
    a.filePath.localeCompare(b.filePath, undefined, { sensitivity: 'base' })

  encrypted.sort(sortByPath)
  plainMp3.sort(sortByPath)

  let withLrc = 0
  let withoutLrc = 0
  for (const item of [...encrypted, ...plainMp3]) {
    if (item.hasLrc) withLrc++
    else withoutLrc++
  }

  const neteaseCount = encrypted.filter((i) => i.platform === 'netease').length
  const qqCount = encrypted.filter((i) => i.platform === 'qq').length

  return {
    encrypted,
    plainMp3,
    stats: {
      encryptedTotal: encrypted.length,
      neteaseCount,
      qqCount,
      plainMp3Total: plainMp3.length,
      withLrc,
      withoutLrc
    },
    empty: encrypted.length === 0 && plainMp3.length === 0
  }
}
