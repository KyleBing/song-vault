/**
 * LRC 歌词复制归位核心逻辑。
 * 以目标文件夹中的音频为主进行匹配与展示。
 */

import fs from 'fs'
import path from 'path'
import type { PathFilterRule } from './pathFilters'
import { shouldFilterEntry } from './pathFilters'
import { pickSourceLrc, type SourceSelection } from './sourcePick'

/** 参与匹配的音频文件扩展名（小写，不含点） */
export const AUDIO_EXTENSIONS = new Set([
  'mp3', 'flac', 'm4a', 'aac', 'ogg', 'opus',
  'wav', 'wma', 'ape', 'alac', 'aiff', 'aif',
  'dsf', 'dff', 'wv', 'mpc', 'mp4', 'mkv'
])

/** 单条音频记录的状态 */
export type AudioItemStatus =
  | 'matched' // 本目录同级已有同名 .lrc
  | 'can_copy' // 本目录无歌词，LRC 源中有可复制的文件
  | 'no_lrc_source' // 本目录无歌词，LRC 源中也没有
  | 'source_ambiguous' // LRC 源中多个同名 .lrc，需用户选择使用哪一个
  | 'copied' // 已执行复制
  | 'copy_error' // 复制失败

/** 以音频为主的一条匹配记录 */
export interface AudioJobItem {
  audioPath: string
  audioName: string
  songKey: string
  destDir: string
  status: AudioItemStatus
  message?: string
  /** 本目录是否已有同级同名 .lrc */
  hasLocalLrc: boolean
  /** 本目录内已存在的歌词路径 */
  localLrcPath?: string
  /** LRC 源中同名歌词路径（可多个） */
  sourceLrcPaths?: string[]
  /** 已解析/选定的源歌词路径（多个候选时已选定） */
  selectedSourceLrcPath?: string
  /** 计划复制到本目录的歌词路径 */
  plannedDestLrcPath?: string
}

/** 目标文件夹中无同级同名音频的「多余」歌词 */
export interface OrphanLrcItem {
  lrcPath: string
  lrcName: string
  destDir: string
  message: string
  fileSizeBytes: number
  /** 文件名与大小均匹配的对应文件（重复副本判定用） */
  canonicalPath?: string
  canonicalSizeBytes?: number
}

/** 目标文件夹中 macOS 编号重复的「多余」音频 */
export interface OrphanAudioItem {
  audioPath: string
  audioName: string
  destDir: string
  message: string
  fileSizeBytes: number
  /** 文件名与大小均匹配的对应文件（重复副本判定用） */
  canonicalPath?: string
  canonicalSizeBytes?: number
}

/** 任务汇总统计 */
export interface JobStats {
  audioTotal: number
  matched: number
  canCopy: number
  noLrcSource: number
  sourceAmbiguous: number
  copied: number
  copyErrors: number
  orphanLrc: number
  orphanAudio: number
}

/** runJob 的完整返回 */
export interface JobResult {
  audioItems: AudioJobItem[]
  orphanLrcItems: OrphanLrcItem[]
  orphanAudioItems: OrphanAudioItem[]
  stats: JobStats
  empty: boolean
  execute: boolean
}

/** runJob 入参 */
export interface RunJobParams extends SourceSelection {
  lrcDirs: string[]
  searchRoots: string[]
  execute: boolean
  pathFilterRules: PathFilterRule[]
}

/** 单首音频：将匹配的 LRC 复制到音频所在目录 */
export interface CopyLrcParams {
  sourceLrcPath: string
  destLrcPath: string
}

/** 单首复制结果 */
export interface CopyLrcResult {
  ok: boolean
  message?: string
}

/** 删除多余歌词入参 */
export interface DeleteOrphanParams {
  lrcPaths: string[]
}

/** 删除多余音频入参 */
export interface DeleteOrphanAudioParams {
  audioPaths: string[]
}

/** 删除多余文件结果 */
export interface DeleteOrphanResult {
  deleted: number
  errors: Array<{ path: string; message: string }>
}

function normName(name: string): string {
  return name.toLowerCase()
}

/**
 * macOS 复制同名文件时产生的编号后缀，如 abc(1) → abc。
 * 若搜索范围内存在同名 abc.* 且字节大小相同，则 abc(1).* 视为重复副本。
 */
function parseMacOsDuplicateBase(basename: string): string | null {
  const m = basename.match(/^(.+)\((\d+)\)$/i)
  if (!m) return null
  return normName(m[1])
}

function readFileSizeBytes(filePath: string): number {
  try {
    return fs.statSync(filePath).size
  } catch {
    return -1
  }
}

interface ScannedTargetFile {
  path: string
  name: string
  dir: string
  key: string
  sizeBytes: number
}

/** 递归遍历搜索目标目录（跳过 LRC 源目录） */
function walkTargetDirs(
  searchRoots: string[],
  lrcDirs: string[],
  pathFilterRules: PathFilterRule[],
  onDir: (dir: string) => void
): void {
  const lrcResolved = lrcDirs.map((d) => path.resolve(d))

  function walk(dir: string): void {
    const current = path.resolve(dir)
    if (isInsideAny(current, lrcResolved)) return

    onDir(current)

    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }

    for (const ent of entries) {
      if (!ent.isDirectory()) continue
      if (shouldFilterEntry(ent.name, true, pathFilterRules)) continue
      const full = path.join(current, ent.name)
      const fullResolved = path.resolve(full)
      if (
        lrcResolved.some(
          (p) => fullResolved === p || isInside(fullResolved, p)
        )
      ) {
        continue
      }
      walk(full)
    }
  }

  for (const searchRoot of searchRoots) {
    walk(path.resolve(searchRoot))
  }
}

function findSizeMatchedCanonical(
  candidates: ScannedTargetFile[],
  sizeBytes: number,
  preferDir?: string
): ScannedTargetFile | null {
  const matched = candidates.filter(
    (c) => c.sizeBytes >= 0 && c.sizeBytes === sizeBytes
  )
  if (matched.length === 0) return null
  if (preferDir) {
    const sameDir = matched.find((c) => c.dir === preferDir)
    if (sameDir) return sameDir
  }
  return matched.sort((a, b) =>
    a.path.localeCompare(b.path, undefined, { sensitivity: 'base' })
  )[0]
}

function duplicateOrphanMessage(
  matched: ScannedTargetFile,
  itemDir: string
): string {
  if (matched.dir === itemDir) {
    return `与 ${matched.name} 大小相同，同目录重复副本`
  }
  return `与 ${matched.name} 大小相同，重复副本`
}

function isInside(child: string, parent: string): boolean {
  const c = path.resolve(child)
  const p = path.resolve(parent)
  if (c === p) return true
  const rel = path.relative(p, c)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

function isInsideAny(child: string, parents: string[]): boolean {
  return parents.some((p) => isInside(child, p))
}

/** 同级目录下成对出现的歌词与音频 */
interface SiblingPair {
  lrcPath: string
  audioPath: string
  destDir: string
}

/**
 * 某文件夹内（仅同级）是否已有同名歌名的 .lrc 与音频。
 */
function findSiblingLrcAudioPair(
  dir: string,
  songKey: string,
  extensions: Set<string>
): SiblingPair | null {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return null
  }

  let lrcPath: string | null = null
  let audioPath: string | null = null

  for (const ent of entries) {
    if (!ent.isFile()) continue
    const full = path.join(dir, ent.name)
    const baseKey = normName(path.parse(ent.name).name)
    if (baseKey !== songKey) continue

    const ext = path.extname(ent.name).slice(1).toLowerCase()
    if (ext === 'lrc') {
      lrcPath = full
    } else if (extensions.has(ext)) {
      audioPath = full
    }
  }

  if (!lrcPath || !audioPath) return null
  return { lrcPath, audioPath, destDir: dir }
}

function walkLrcDir(
  dir: string,
  files: string[],
  pathFilterRules: PathFilterRule[]
): void {
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
      walkLrcDir(full, files, pathFilterRules)
    } else if (ent.isFile() && /\.lrc$/i.test(ent.name)) {
      files.push(full)
    }
  }
}

/** 从 LRC 源目录递归收集 .lrc，建立歌名 -> 路径列表索引 */
function buildLrcSourceIndex(
  lrcDirs: string[],
  pathFilterRules: PathFilterRule[]
): Map<string, string[]> {
  const index = new Map<string, string[]>()

  for (const lrcDir of lrcDirs) {
    if (!fs.existsSync(lrcDir) || !fs.statSync(lrcDir).isDirectory()) {
      throw new Error(`LRC 目录不存在: ${lrcDir}`)
    }
    const files: string[] = []
    walkLrcDir(path.resolve(lrcDir), files, pathFilterRules)
    for (const lrcPath of files) {
      const key = normName(path.parse(path.basename(lrcPath)).name)
      const list = index.get(key) ?? []
      list.push(lrcPath)
      index.set(key, list)
    }
  }

  return index
}

/** 递归收集搜索范围内所有音频文件路径 */
function collectAllAudioPaths(
  searchRoots: string[],
  lrcDirs: string[],
  extensions: Set<string>,
  pathFilterRules: PathFilterRule[]
): string[] {
  const paths: string[] = []
  const lrcResolved = lrcDirs.map((d) => path.resolve(d))

  function walk(dir: string): void {
    const current = path.resolve(dir)
    if (isInsideAny(current, lrcResolved)) return

    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`Warning: cannot read ${current}: ${msg}`)
      return
    }

    for (const ent of entries) {
      if (shouldFilterEntry(ent.name, ent.isDirectory(), pathFilterRules)) {
        continue
      }
      const full = path.join(current, ent.name)
      const fullResolved = path.resolve(full)
      if (ent.isDirectory()) {
        if (
          lrcResolved.some(
            (p) => fullResolved === p || isInside(fullResolved, p)
          )
        ) {
          continue
        }
        walk(full)
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).slice(1).toLowerCase()
        if (extensions.has(ext)) {
          paths.push(full)
        }
      }
    }
  }

  for (const searchRoot of searchRoots) {
    walk(path.resolve(searchRoot))
  }

  return paths.sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  )
}

/** 收集目标文件夹内「多余」歌词：无对应音频，或搜索范围内大小相同的编号重复副本 */
function collectOrphanLrcInTargets(
  searchRoots: string[],
  lrcDirs: string[],
  extensions: Set<string>,
  pathFilterRules: PathFilterRule[]
): OrphanLrcItem[] {
  const allLrc: ScannedTargetFile[] = []
  const audioKeysByDir = new Map<string, Set<string>>()

  walkTargetDirs(searchRoots, lrcDirs, pathFilterRules, (dir) => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`Warning: cannot read ${dir}: ${msg}`)
      return
    }

    const audioKeys = new Set<string>()

    for (const ent of entries) {
      if (!ent.isFile()) continue
      if (shouldFilterEntry(ent.name, false, pathFilterRules)) continue
      const full = path.join(dir, ent.name)
      const key = normName(path.parse(ent.name).name)
      const ext = path.extname(ent.name).slice(1).toLowerCase()

      if (ext === 'lrc') {
        allLrc.push({
          path: full,
          name: ent.name,
          dir,
          key,
          sizeBytes: readFileSizeBytes(full)
        })
      } else if (extensions.has(ext)) {
        audioKeys.add(key)
      }
    }

    audioKeysByDir.set(dir, audioKeys)
  })

  const canonicalByKey = new Map<string, ScannedTargetFile[]>()
  for (const lrc of allLrc) {
    const base = path.parse(lrc.name).name
    if (parseMacOsDuplicateBase(base)) continue
    const list = canonicalByKey.get(lrc.key) ?? []
    list.push(lrc)
    canonicalByKey.set(lrc.key, list)
  }

  const orphans: OrphanLrcItem[] = []
  const seen = new Set<string>()

  for (const lrc of allLrc) {
    const base = path.parse(lrc.name).name
    const dupCanonical = parseMacOsDuplicateBase(base)
    if (!dupCanonical) continue

    const matched = findSizeMatchedCanonical(
      canonicalByKey.get(dupCanonical) ?? [],
      lrc.sizeBytes,
      lrc.dir
    )
    if (!matched) continue

    const resolved = path.resolve(lrc.path)
    if (seen.has(resolved)) continue
    seen.add(resolved)

    orphans.push({
      lrcPath: lrc.path,
      lrcName: lrc.name,
      destDir: lrc.dir,
      fileSizeBytes: lrc.sizeBytes,
      canonicalPath: matched.path,
      canonicalSizeBytes: matched.sizeBytes,
      message: duplicateOrphanMessage(matched, lrc.dir)
    })
  }

  for (const lrc of allLrc) {
    const resolved = path.resolve(lrc.path)
    if (seen.has(resolved)) continue
    if (audioKeysByDir.get(lrc.dir)?.has(lrc.key)) continue
    seen.add(resolved)

    orphans.push({
      lrcPath: lrc.path,
      lrcName: lrc.name,
      destDir: lrc.dir,
      fileSizeBytes: lrc.sizeBytes,
      message: '同级目录无同名音频'
    })
  }

  return orphans.sort((a, b) =>
    a.lrcPath.localeCompare(b.lrcPath, undefined, { sensitivity: 'base' })
  )
}

/** 收集目标文件夹内「多余」音频：搜索范围内大小相同的 abc(1).mp3 等重复副本 */
function collectOrphanAudioInTargets(
  searchRoots: string[],
  lrcDirs: string[],
  extensions: Set<string>,
  pathFilterRules: PathFilterRule[]
): OrphanAudioItem[] {
  const allAudio: Array<ScannedTargetFile & { ext: string }> = []

  walkTargetDirs(searchRoots, lrcDirs, pathFilterRules, (dir) => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`Warning: cannot read ${dir}: ${msg}`)
      return
    }

    for (const ent of entries) {
      if (!ent.isFile()) continue
      if (shouldFilterEntry(ent.name, false, pathFilterRules)) continue
      const full = path.join(dir, ent.name)
      const ext = path.extname(ent.name).slice(1).toLowerCase()
      if (!extensions.has(ext)) continue

      allAudio.push({
        path: full,
        name: ent.name,
        dir,
        key: normName(path.parse(ent.name).name),
        sizeBytes: readFileSizeBytes(full),
        ext
      })
    }
  })

  const canonicalByExtKey = new Map<string, ScannedTargetFile[]>()
  for (const audio of allAudio) {
    const base = path.parse(audio.name).name
    if (parseMacOsDuplicateBase(base)) continue
    const indexKey = `${audio.ext}:${audio.key}`
    const list = canonicalByExtKey.get(indexKey) ?? []
    list.push(audio)
    canonicalByExtKey.set(indexKey, list)
  }

  const orphans: OrphanAudioItem[] = []
  const seen = new Set<string>()

  for (const audio of allAudio) {
    const base = path.parse(audio.name).name
    const dupCanonical = parseMacOsDuplicateBase(base)
    if (!dupCanonical) continue

    const matched = findSizeMatchedCanonical(
      canonicalByExtKey.get(`${audio.ext}:${dupCanonical}`) ?? [],
      audio.sizeBytes,
      audio.dir
    )
    if (!matched) continue

    const resolved = path.resolve(audio.path)
    if (seen.has(resolved)) continue
    seen.add(resolved)

    orphans.push({
      audioPath: audio.path,
      audioName: audio.name,
      destDir: audio.dir,
      fileSizeBytes: audio.sizeBytes,
      canonicalPath: matched.path,
      canonicalSizeBytes: matched.sizeBytes,
      message: duplicateOrphanMessage(matched, audio.dir)
    })
  }

  return orphans.sort((a, b) =>
    a.audioPath.localeCompare(b.audioPath, undefined, { sensitivity: 'base' })
  )
}

function emptyStats(): JobStats {
  return {
    audioTotal: 0,
    matched: 0,
    canCopy: 0,
    noLrcSource: 0,
    sourceAmbiguous: 0,
    copied: 0,
    copyErrors: 0,
    orphanLrc: 0,
    orphanAudio: 0
  }
}

function bumpStat(stats: JobStats, status: AudioItemStatus): void {
  switch (status) {
    case 'matched':
    case 'copied':
      if (status === 'matched') stats.matched++
      else stats.copied++
      break
    case 'can_copy':
      stats.canCopy++
      break
    case 'no_lrc_source':
      stats.noLrcSource++
      break
    case 'source_ambiguous':
      stats.sourceAmbiguous++
      break
    case 'copy_error':
      stats.copyErrors++
      break
  }
}

/**
 * 以目标文件夹内全部音频为主构建匹配结果；可选执行复制。
 */
export function runJob(params: RunJobParams): JobResult {
  const {
    lrcDirs,
    searchRoots,
    execute,
    sourceOverrides,
    preferredSourceDir,
    pathFilterRules
  } = params
  const selection: SourceSelection = { sourceOverrides, preferredSourceDir }
  const lrcSourceIndex = buildLrcSourceIndex(lrcDirs, pathFilterRules)
  const audioPaths = collectAllAudioPaths(
    searchRoots,
    lrcDirs,
    AUDIO_EXTENSIONS,
    pathFilterRules
  )
  const orphanLrcItems = collectOrphanLrcInTargets(
    searchRoots,
    lrcDirs,
    AUDIO_EXTENSIONS,
    pathFilterRules
  )
  const orphanAudioItems = collectOrphanAudioInTargets(
    searchRoots,
    lrcDirs,
    AUDIO_EXTENSIONS,
    pathFilterRules
  )
  const orphanAudioPaths = new Set(
    orphanAudioItems.map((item) => path.resolve(item.audioPath))
  )

  const stats = emptyStats()
  stats.orphanLrc = orphanLrcItems.length
  stats.orphanAudio = orphanAudioItems.length

  const audioItems: AudioJobItem[] = []

  for (const audioPath of audioPaths) {
    if (orphanAudioPaths.has(path.resolve(audioPath))) continue
    const audioName = path.basename(audioPath)
    const songKey = normName(path.parse(audioName).name)
    const destDir = path.dirname(audioPath)
    const siblingPair = findSiblingLrcAudioPair(
      destDir,
      songKey,
      AUDIO_EXTENSIONS
    )
    /** 本目录同级已有同名歌词与音频（成对即视为该歌名已匹配） */
    const hasLocalLrc = siblingPair !== null
    const localLrcPath = siblingPair?.lrcPath
    const sourceLrcPaths = lrcSourceIndex.get(songKey) ?? []

    let status: AudioItemStatus
    let message: string | undefined
    let plannedDestLrcPath: string | undefined
    let chosenSource: string | undefined

    if (hasLocalLrc) {
      status = 'matched'
      message = '本目录已有同名歌词'
    } else if (sourceLrcPaths.length === 0) {
      status = 'no_lrc_source'
      message = 'LRC 源中无同名歌词'
    } else {
      chosenSource = pickSourceLrc(songKey, sourceLrcPaths, selection) ?? undefined
      if (!chosenSource) {
        status = 'source_ambiguous'
        message = `LRC 源中有 ${sourceLrcPaths.length} 个同名文件，请选择`
      } else {
        plannedDestLrcPath = path.join(
          destDir,
          path.basename(chosenSource)
        )
        status = 'can_copy'
        message = '可从 LRC 源复制到本目录'
      }
    }

    const item: AudioJobItem = {
      audioPath,
      audioName,
      songKey,
      destDir,
      status,
      message,
      hasLocalLrc,
      localLrcPath,
      sourceLrcPaths: sourceLrcPaths.length > 0 ? [...sourceLrcPaths] : undefined,
      selectedSourceLrcPath: chosenSource,
      plannedDestLrcPath
    }

    if (
      execute &&
      status === 'can_copy' &&
      item.plannedDestLrcPath &&
      chosenSource
    ) {
      try {
        fs.copyFileSync(chosenSource, item.plannedDestLrcPath)
        item.status = 'copied'
        item.message = '已复制到本目录'
        item.hasLocalLrc = true
        item.localLrcPath = item.plannedDestLrcPath
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        item.status = 'copy_error'
        item.message = msg
      }
    }

    bumpStat(stats, item.status)
    audioItems.push(item)
  }

  stats.audioTotal = audioItems.length

  return {
    audioItems,
    orphanLrcItems,
    orphanAudioItems,
    stats,
    empty:
      audioItems.length === 0 &&
      orphanLrcItems.length === 0 &&
      orphanAudioItems.length === 0,
    execute
  }
}

/**
 * 将 LRC 源文件复制到音频同级目录（保留源文件）。
 */
export function copyLrcToAudio(params: CopyLrcParams): CopyLrcResult {
  const { sourceLrcPath, destLrcPath } = params

  if (!fs.existsSync(sourceLrcPath)) {
    return { ok: false, message: 'LRC 源文件不存在' }
  }
  if (fs.existsSync(destLrcPath)) {
    return { ok: false, message: '目标目录已有同名歌词' }
  }

  try {
    fs.mkdirSync(path.dirname(destLrcPath), { recursive: true })
    fs.copyFileSync(sourceLrcPath, destLrcPath)
    return { ok: true, message: '已复制到音频目录' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, message: msg }
  }
}

/** 删除目标文件夹中的多余 .lrc 文件 */
export function deleteOrphanLrc(params: DeleteOrphanParams): DeleteOrphanResult {
  return deleteOrphanFiles(params.lrcPaths)
}

/** 删除目标文件夹中的多余音频文件 */
export function deleteOrphanAudio(
  params: DeleteOrphanAudioParams
): DeleteOrphanResult {
  return deleteOrphanFiles(params.audioPaths)
}

function deleteOrphanFiles(filePaths: string[]): DeleteOrphanResult {
  let deleted = 0
  const errors: Array<{ path: string; message: string }> = []

  for (const filePath of filePaths) {
    try {
      if (!fs.existsSync(filePath)) {
        errors.push({ path: filePath, message: '文件不存在' })
        continue
      }
      fs.unlinkSync(filePath)
      deleted++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push({ path: filePath, message: msg })
    }
  }

  return { deleted, errors }
}
