/**
 * 音频搜索目标目录浏览与管理：目录树、目录及子目录音频列表、文件夹与文件增删改。
 */

import fs from 'fs'
import fsPromises from 'fs/promises'
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
  /** 音频搜索目标中同名歌名的已有音频路径（解码页按需填充） */
  sourceAudioPaths?: string[]
  /** 是否已执行搜索目标匹配（false 表示未配置搜索目标） */
  sourceAudioChecked?: boolean
  /** 音频指标（列表加载后按需填充） */
  audio: AudioFileMetrics
}

export interface FileStatFields {
  sizeBytes: number
  birthtimeMs: number
  mtimeMs: number
}

/** 从 fs.Stats 解析文件大小、创建时间、修改时间 */
function fileStatFieldsFromStat(stat: fs.Stats): FileStatFields {
  let sizeBytes = Number(stat.size)
  let birthtimeMs = 0
  let mtimeMs = 0
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
  return { sizeBytes, birthtimeMs, mtimeMs }
}

/** 从 fs.statSync 读取文件大小、创建时间、修改时间 */
export function readFileStatFields(filePath: string): FileStatFields {
  try {
    return fileStatFieldsFromStat(fs.statSync(filePath))
  } catch {
    return { sizeBytes: 0, birthtimeMs: 0, mtimeMs: 0 }
  }
}

const FILE_STAT_BATCH_CONCURRENCY = 64

/** 批量读取文件 stat（限制并发，不阻塞列表先展示） */
export async function readFileStatFieldsBatch(
  filePaths: string[],
  concurrency = FILE_STAT_BATCH_CONCURRENCY
): Promise<Record<string, FileStatFields>> {
  const unique = [...new Set(filePaths.filter(Boolean))]
  const out: Record<string, FileStatFields> = {}
  if (unique.length === 0) return out

  let index = 0
  async function worker(): Promise<void> {
    while (index < unique.length) {
      const i = index++
      const p = unique[i]!
      try {
        out[p] = fileStatFieldsFromStat(await fsPromises.stat(p))
      } catch {
        out[p] = { sizeBytes: 0, birthtimeMs: 0, mtimeMs: 0 }
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, unique.length) },
    () => worker()
  )
  await Promise.all(workers)
  return out
}

export interface BrowseRootCheck {
  path: string
  ok: boolean
  error?: string
}

export interface BrowseRootsParams {
  browseRoots: string[]
}

/** 校验单个乐库/搜索目标根目录是否可访问 */
export function checkBrowseRoot(root: string | undefined | null): BrowseRootCheck {
  const trimmed = (root ?? '').trim()
  if (!trimmed) {
    return { path: '', ok: false, error: '未指定目录' }
  }
  const resolved = path.resolve(trimmed)
  if (!fs.existsSync(resolved)) {
    return { path: resolved, ok: false, error: `目录不存在: ${resolved}` }
  }
  const stat = fs.statSync(resolved)
  if (!stat.isDirectory()) {
    return { path: resolved, ok: false, error: `不是文件夹: ${resolved}` }
  }
  return { path: resolved, ok: true }
}

/** 批量校验搜索目标根目录（与配置项一一对应） */
export function validateSearchRoots(roots: string[]): BrowseRootCheck[] {
  return roots.map((r) => checkBrowseRoot(r))
}

export interface BrowseListParams extends BrowseRootsParams {
  pathFilterRules: PathFilterRule[]
}

export interface ListSourceDirChildrenParams extends BrowseListParams {
  dirPath: string
}

export interface ListDirAudioFilesParams extends BrowseListParams {
  dirPath: string
  /** 为 true 时列出全部子目录中的音频；默认仅当前目录 */
  includeSubdirs?: boolean
}

export interface BrowseCreateDirParams extends BrowseRootsParams {
  parentPath: string
  name: string
}

export interface BrowseRenamePathParams extends BrowseRootsParams {
  targetPath: string
  newName: string
  /** 目标名已存在时自动追加 (1)、(2)… 后缀 */
  disambiguateIfExists?: boolean
}

export interface BrowseDeletePathParams extends BrowseRootsParams {
  targetPath: string
}

export interface BrowseDeleteFilesParams extends BrowseRootsParams {
  filePaths: string[]
}

export interface BrowseMoveFilesParams extends BrowseRootsParams {
  filePaths: string[]
  destDir: string
}

export interface FindAudioInSearchRootsParams {
  searchRoots: string[]
  /** 文件名（含扩展名），按不含扩展名的歌名匹配 */
  queryNames: string[]
  pathFilterRules: PathFilterRule[]
}

export interface BrowseRenameResult {
  oldPath: string
  newPath: string
}

export interface BrowseDeleteFilesResult {
  deleted: number
  errors: Array<{ path: string; message: string }>
}

export interface BrowseMoveFilesResult {
  moved: number
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

/** 在目录内生成不冲突的条目名；excludePath 为正在重命名的原路径时可视为可用 */
export function resolveUniqueEntryName(
  parentDir: string,
  desiredName: string,
  excludePath?: string
): string {
  const excluded = excludePath ? path.resolve(excludePath) : null

  function isAvailable(name: string): boolean {
    const full = path.resolve(path.join(parentDir, name))
    if (excluded && full === excluded) return true
    return !fs.existsSync(full)
  }

  const baseName = assertValidEntryName(desiredName)
  if (isAvailable(baseName)) return baseName

  const parsed = path.parse(baseName)
  const ext = parsed.ext
  const stem = parsed.name

  for (let i = 1; i < 10_000; i += 1) {
    const candidate = assertValidEntryName(`${stem}(${i})${ext}`)
    if (isAvailable(candidate)) return candidate
  }

  throw new Error('无法生成不冲突的文件名')
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

  if (!fs.existsSync(dirPath)) {
    throw new Error(`目录不存在: ${dirPath}`)
  }

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

function scanDirAudioFiles(
  dirPath: string,
  pathFilterRules: PathFilterRule[],
  items: DirAudioFileItem[],
  isRoot: boolean,
  includeSubdirs: boolean
): void {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true })
  } catch (err) {
    if (isRoot) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`无法读取目录: ${msg}`)
    }
    return
  }

  const lrcByBase = new Map<string, string>()
  const subdirs: string[] = []

  for (const ent of entries) {
    if (ent.isDirectory()) {
      if (!shouldFilterEntry(ent.name, true, pathFilterRules)) {
        subdirs.push(path.join(dirPath, ent.name))
      }
      continue
    }
    if (!ent.isFile()) continue
    if (shouldFilterEntry(ent.name, false, pathFilterRules)) continue
    const parsed = path.parse(ent.name)
    if (parsed.ext.slice(1).toLowerCase() !== 'lrc') continue
    lrcByBase.set(normName(parsed.name), path.join(dirPath, ent.name))
  }

  for (const ent of entries) {
    if (!ent.isFile()) continue
    if (shouldFilterEntry(ent.name, false, pathFilterRules)) continue
    const ext = path.extname(ent.name).slice(1).toLowerCase()
    if (!isSearchTargetAudioExt(ext)) continue

    const baseName = path.parse(ent.name).name
    const key = normName(baseName)
    const full = path.join(dirPath, ent.name)

    items.push({
      filePath: full,
      fileName: ent.name,
      ext,
      sizeBytes: 0,
      birthtimeMs: 0,
      mtimeMs: 0,
      hasLrc: lrcByBase.has(key),
      lrcPath: lrcByBase.get(key),
      audio: emptyAudioFileMetrics()
    })
  }

  subdirs.sort((a, b) =>
    path.basename(a).localeCompare(path.basename(b), undefined, {
      sensitivity: 'base'
    })
  )

  if (includeSubdirs) {
    for (const sub of subdirs) {
      scanDirAudioFiles(sub, pathFilterRules, items, false, includeSubdirs)
    }
  }
}

/** 列出目录下的音频文件（可选包含全部子目录；同级 LRC 按各目录内匹配） */
export function listDirAudioFiles(
  params: ListDirAudioFilesParams
): DirAudioFileItem[] {
  const roots = normalizeRoots(params.browseRoots)
  const dirPath = path.resolve(params.dirPath)
  assertUnderBrowseRoots(dirPath, roots)

  if (!fs.existsSync(dirPath)) {
    throw new Error(`目录不存在: ${dirPath}`)
  }

  const items: DirAudioFileItem[] = []
  scanDirAudioFiles(
    dirPath,
    params.pathFilterRules,
    items,
    true,
    params.includeSubdirs === true
  )
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

/** 在音频搜索目标内递归建立「歌名 → 音频路径」索引（歌名不区分大小写） */
function buildAudioBaseNameIndexInSearchRoots(
  searchRoots: string[],
  pathFilterRules: PathFilterRule[]
): Map<string, string[]> {
  const index = new Map<string, string[]>()
  const roots = normalizeRoots(searchRoots)

  function addPath(filePath: string, baseKey: string): void {
    const list = index.get(baseKey) ?? []
    list.push(filePath)
    index.set(baseKey, list)
  }

  function walk(dir: string): void {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
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
        if (!isSearchTargetAudioExt(ext)) continue
        const baseKey = normName(path.parse(ent.name).name)
        addPath(full, baseKey)
      }
    }
  }

  for (const root of roots) {
    try {
      if (!fs.existsSync(root)) continue
      const stat = fs.statSync(root)
      if (!stat.isDirectory()) continue
      walk(root)
    } catch {
      /* 跳过不可读的根目录 */
    }
  }

  for (const [key, paths] of index) {
    paths.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    index.set(key, paths)
  }

  return index
}

/**
 * 在音频搜索目标中查找与 queryNames 歌名（不含扩展名）相同的已有音频。
 * 返回对象的键为传入的 queryNames 原值。
 */
export function findAudioInSearchRootsByNames(
  params: FindAudioInSearchRootsParams
): Record<string, string[]> {
  const index = buildAudioBaseNameIndexInSearchRoots(
    params.searchRoots,
    params.pathFilterRules
  )
  const out: Record<string, string[]> = {}
  for (const name of params.queryNames) {
    const key = normName(path.parse(name).name)
    out[name] = index.get(key) ? [...index.get(key)!] : []
  }
  return out
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

  const newNameInput = assertValidEntryName(params.newName)
  const parent = path.dirname(oldPath)
  const newName = params.disambiguateIfExists
    ? resolveUniqueEntryName(parent, newNameInput, oldPath)
    : newNameInput
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

function findSiblingLrc(audioPath: string): string | null {
  const dir = path.dirname(audioPath)
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return null
  }
  const baseKey = normName(path.parse(audioPath).name)
  for (const ent of entries) {
    if (!ent.isFile()) continue
    const parsed = path.parse(ent.name)
    if (parsed.ext.slice(1).toLowerCase() !== 'lrc') continue
    if (normName(parsed.name) === baseKey) {
      return path.join(dir, ent.name)
    }
  }
  return null
}

function safeRenameFile(src: string, dest: string): void {
  try {
    fs.renameSync(src, dest)
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as NodeJS.ErrnoException).code)
        : ''
    if (code === 'EXDEV') {
      fs.copyFileSync(src, dest)
      fs.unlinkSync(src)
      return
    }
    throw err
  }
}

export function browseMoveFiles(
  params: BrowseMoveFilesParams
): BrowseMoveFilesResult {
  const roots = normalizeRoots(params.browseRoots)
  const destDir = path.resolve(params.destDir)
  assertUnderBrowseRoots(destDir, roots)

  if (!fs.existsSync(destDir)) {
    throw new Error('目标文件夹不存在')
  }
  const destStat = fs.statSync(destDir)
  if (!destStat.isDirectory()) {
    throw new Error('目标必须是文件夹')
  }

  const errors: BrowseMoveFilesResult['errors'] = []
  let moved = 0

  for (const filePath of params.filePaths) {
    const resolved = path.resolve(filePath)
    try {
      assertUnderBrowseRoots(resolved, roots)
      if (!fs.existsSync(resolved)) {
        errors.push({ path: resolved, message: '文件不存在' })
        continue
      }
      const stat = fs.statSync(resolved)
      if (!stat.isFile()) {
        errors.push({ path: resolved, message: '不是文件' })
        continue
      }

      const srcDir = path.resolve(path.dirname(resolved))
      if (srcDir === destDir) continue

      const fileName = path.basename(resolved)
      const destAudio = path.join(destDir, fileName)
      if (fs.existsSync(destAudio)) {
        errors.push({ path: resolved, message: '目标目录已有同名文件' })
        continue
      }

      const srcLrc = findSiblingLrc(resolved)
      let destLrc: string | null = null
      if (srcLrc) {
        destLrc = path.join(destDir, path.basename(srcLrc))
        if (fs.existsSync(destLrc)) {
          errors.push({
            path: resolved,
            message: '目标目录已有同名歌词文件'
          })
          continue
        }
      }

      safeRenameFile(resolved, destAudio)
      if (srcLrc && destLrc) {
        try {
          safeRenameFile(srcLrc, destLrc)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          errors.push({ path: srcLrc, message: `歌词移动失败: ${msg}` })
        }
      }
      moved++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push({ path: resolved, message: msg })
    }
  }

  return { moved, errors }
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
