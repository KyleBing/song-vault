/**
 * 音频搜索目标目录浏览与管理：目录树、单目录音频列表、文件夹与文件增删改。
 */

import fs from 'fs'
import path from 'path'
import { emptyAudioFileMetrics, type AudioFileMetrics } from './audioFileMetrics'
import { AUDIO_EXTENSIONS } from './lrcJob'
import { isDecryptableExtension } from './musicFormats'
export { isBrowseRoot } from './pathKeys'
import type { PathFilterRule } from './pathFilters'
import { shouldFilterEntry } from './pathFilters'

export interface SourceDirChild {
  path: string
  name: string
  hasSubdirs: boolean
}

export interface DirAudioFileItem {
  filePath: string
  fileName: string
  ext: string
  /** 文件大小（字节） */
  sizeBytes: number
  /** 创建时间（毫秒时间戳） */
  birthtimeMs: number
  /** 最后修改时间（毫秒时间戳） */
  mtimeMs: number
  hasLrc: boolean
  lrcPath?: string
  /** 音频指标（列表加载后按需填充） */
  audio: AudioFileMetrics
}

export interface FileStatFields {
  sizeBytes: number
  birthtimeMs: number
  mtimeMs: number
}

/** 从 fs.statSync 读取文件大小、创建时间、修改时间 */
export function readFileStatFields(filePath: string): FileStatFields {
  let sizeBytes = 0
  let birthtimeMs = 0
  let mtimeMs = 0
  try {
    const stat = fs.statSync(filePath)
    sizeBytes = Number(stat.size)
    const birthRaw = Number(stat.birthtimeMs ?? stat.birthtime.getTime())
    if (Number.isFinite(birthRaw) && birthRaw > 0) {
      birthtimeMs = birthRaw
    } else {
      birthtimeMs = Number(stat.ctimeMs ?? stat.ctime.getTime())
    }
    mtimeMs = Number(stat.mtimeMs ?? stat.mtime.getTime())
    if (!Number.isFinite(sizeBytes)) sizeBytes = 0
    if (!Number.isFinite(birthtimeMs)) birthtimeMs = 0
    if (!Number.isFinite(mtimeMs)) mtimeMs = 0
  } catch {
    /* 无法 stat 时保留 0 */
  }
  return { sizeBytes, birthtimeMs, mtimeMs }
}

export interface BrowseRootsParams {
  browseRoots: string[]
}

export interface BrowseListParams extends BrowseRootsParams {
  pathFilterRules: PathFilterRule[]
}

export interface ListSourceDirChildrenParams extends BrowseListParams {
  dirPath: string
}

export interface ListDirAudioFilesParams extends BrowseListParams {
  dirPath: string
}

export interface BrowseCreateDirParams extends BrowseRootsParams {
  parentPath: string
  name: string
}

export interface BrowseRenamePathParams extends BrowseRootsParams {
  targetPath: string
  newName: string
}

export interface BrowseDeletePathParams extends BrowseRootsParams {
  targetPath: string
}

export interface BrowseDeleteFilesParams extends BrowseRootsParams {
  filePaths: string[]
}

export interface BrowseRenameResult {
  oldPath: string
  newPath: string
}

export interface BrowseDeleteFilesResult {
  deleted: number
  errors: Array<{ path: string; message: string }>
}

function normName(name: string): string {
  return name.toLowerCase()
}

function normalizeRoots(roots: string[]): string[] {
  return roots.map((r) => r.trim()).filter(Boolean).map((r) => path.resolve(r))
}

function isInside(child: string, parent: string): boolean {
  const c = path.resolve(child)
  const p = path.resolve(parent)
  if (c === p) return true
  const rel = path.relative(p, c)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

export function isUnderBrowseRoots(target: string, roots: string[]): boolean {
  const resolved = path.resolve(target)
  return normalizeRoots(roots).some((root) => {
    return resolved === root || isInside(resolved, root)
  })
}

function assertUnderBrowseRoots(target: string, roots: string[]): void {
  const trimmed = normalizeRoots(roots)
  if (trimmed.length === 0) {
    throw new Error('未配置音频搜索目标')
  }
  if (!isUnderBrowseRoots(target, trimmed)) {
    throw new Error('路径不在音频搜索目标范围内')
  }
}

function assertValidEntryName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('名称不能为空')
  if (/[/\\:*?"<>|]/.test(trimmed)) {
    throw new Error('名称不能包含 \\ / : * ? " < > |')
  }
  return trimmed
}

function dirHasSubdirs(dirPath: string): boolean {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    return entries.some((e) => e.isDirectory())
  } catch {
    return false
  }
}

export function isSearchTargetAudioExt(ext: string): boolean {
  return AUDIO_EXTENSIONS.has(ext.toLowerCase())
}

export function isEncryptedMusicFileExt(ext: string): boolean {
  return isDecryptableExtension(ext)
}

export function listSourceDirChildren(
  params: ListSourceDirChildrenParams
): SourceDirChild[] {
  const roots = normalizeRoots(params.browseRoots)
  const dirPath = path.resolve(params.dirPath)
  assertUnderBrowseRoots(dirPath, roots)

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`无法读取目录: ${msg}`)
  }

  const children: SourceDirChild[] = []
  for (const ent of entries) {
    if (!ent.isDirectory()) continue
    if (
      shouldFilterEntry(ent.name, true, params.pathFilterRules)
    ) {
      continue
    }
    const full = path.join(dirPath, ent.name)
    children.push({
      path: full,
      name: ent.name,
      hasSubdirs: dirHasSubdirs(full)
    })
  }

  return children.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  )
}

export function listDirAudioFiles(
  params: ListDirAudioFilesParams
): DirAudioFileItem[] {
  const roots = normalizeRoots(params.browseRoots)
  const dirPath = path.resolve(params.dirPath)
  assertUnderBrowseRoots(dirPath, roots)

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`无法读取目录: ${msg}`)
  }

  const lrcByBase = new Map<string, string>()

  for (const ent of entries) {
    if (!ent.isFile()) continue
    if (shouldFilterEntry(ent.name, false, params.pathFilterRules)) continue
    const parsed = path.parse(ent.name)
    if (parsed.ext.slice(1).toLowerCase() !== 'lrc') continue
    lrcByBase.set(normName(parsed.name), path.join(dirPath, ent.name))
  }

  const items: DirAudioFileItem[] = []

  for (const ent of entries) {
    if (!ent.isFile()) continue
    if (shouldFilterEntry(ent.name, false, params.pathFilterRules)) continue
    const ext = path.extname(ent.name).slice(1).toLowerCase()
    if (!isSearchTargetAudioExt(ext)) continue

    const baseName = path.parse(ent.name).name
    const key = normName(baseName)
    const lrcPath = lrcByBase.get(key)
    const full = path.join(dirPath, ent.name)
    const { sizeBytes, birthtimeMs, mtimeMs } = readFileStatFields(full)

    items.push({
      filePath: full,
      fileName: ent.name,
      ext,
      sizeBytes,
      birthtimeMs,
      mtimeMs,
      hasLrc: lrcByBase.has(key),
      lrcPath,
      audio: emptyAudioFileMetrics()
    })
  }

  return items
}

/** 列出目录内可解密的加密音乐文件 */
export function listDirEncryptedMusicFiles(
  params: ListDirAudioFilesParams
): DirAudioFileItem[] {
  const roots = normalizeRoots(params.browseRoots)
  const dirPath = path.resolve(params.dirPath)
  assertUnderBrowseRoots(dirPath, roots)

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`无法读取目录: ${msg}`)
  }

  const items: DirAudioFileItem[] = []

  for (const ent of entries) {
    if (!ent.isFile()) continue
    if (shouldFilterEntry(ent.name, false, params.pathFilterRules)) continue
    const ext = path.extname(ent.name).slice(1).toLowerCase()
    if (!isEncryptedMusicFileExt(ext)) continue

    const full = path.join(dirPath, ent.name)
    const { sizeBytes, birthtimeMs, mtimeMs } = readFileStatFields(full)

    items.push({
      filePath: full,
      fileName: ent.name,
      ext,
      sizeBytes,
      birthtimeMs,
      mtimeMs,
      hasLrc: false,
      audio: emptyAudioFileMetrics()
    })
  }

  return items.sort((a, b) =>
    a.fileName.localeCompare(b.fileName, undefined, { sensitivity: 'base' })
  )
}

export function browseCreateDir(params: BrowseCreateDirParams): { path: string } {
  const roots = normalizeRoots(params.browseRoots)
  const parentPath = path.resolve(params.parentPath)
  assertUnderBrowseRoots(parentPath, roots)

  const name = assertValidEntryName(params.name)
  const target = path.join(parentPath, name)

  if (fs.existsSync(target)) {
    throw new Error('文件夹已存在')
  }

  fs.mkdirSync(target)
  return { path: target }
}

export function browseRenamePath(
  params: BrowseRenamePathParams
): BrowseRenameResult {
  const roots = normalizeRoots(params.browseRoots)
  const oldPath = path.resolve(params.targetPath)
  assertUnderBrowseRoots(oldPath, roots)

  const newName = assertValidEntryName(params.newName)
  const parent = path.dirname(oldPath)
  const newPath = path.join(parent, newName)

  if (path.resolve(newPath) === oldPath) {
    return { oldPath, newPath: oldPath }
  }

  if (fs.existsSync(newPath)) {
    throw new Error('目标名称已存在')
  }

  fs.renameSync(oldPath, newPath)
  return { oldPath, newPath }
}

export function browseDeletePath(params: BrowseDeletePathParams): void {
  const roots = normalizeRoots(params.browseRoots)
  const target = path.resolve(params.targetPath)
  assertUnderBrowseRoots(target, roots)

  if (!fs.existsSync(target)) {
    throw new Error('路径不存在')
  }

  const stat = fs.statSync(target)
  if (!stat.isDirectory()) {
    throw new Error('只能删除文件夹')
  }

  fs.rmSync(target, { recursive: true, force: true })
}

export function browseDeleteFiles(
  params: BrowseDeleteFilesParams
): BrowseDeleteFilesResult {
  const roots = normalizeRoots(params.browseRoots)
  const errors: BrowseDeleteFilesResult['errors'] = []
  let deleted = 0

  for (const filePath of params.filePaths) {
    const resolved = path.resolve(filePath)
    try {
      assertUnderBrowseRoots(resolved, roots)
      if (!fs.existsSync(resolved)) continue
      const stat = fs.statSync(resolved)
      if (!stat.isFile()) {
        errors.push({ path: resolved, message: '不是文件' })
        continue
      }
      fs.unlinkSync(resolved)
      deleted++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push({ path: resolved, message: msg })
    }
  }

  return { deleted, errors }
}
