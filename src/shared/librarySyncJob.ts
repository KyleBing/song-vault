/**
 * 双乐库目录对比与单向复制（按相对路径同步到另一侧同名位置）。
 */

import fs from 'fs'
import path from 'path'
import { checkBatchCancelled, type BatchJobParams } from './batchCancel'
import { isPlainAudioFilePath } from './isAudioFilePath'
import type { PathFilterRule } from './pathFilters'
import { shouldFilterEntry } from './pathFilters'

export interface SyncFileEntry {
    relativePath: string
    fileName: string
    size: number
}

export type SyncDiffKind =
    | 'left_only'
    | 'right_only'
    | 'modified'
    | 'moved'

export interface SyncDiffItem {
    relativePath: string
    kind: SyncDiffKind
    left?: SyncFileEntry
    right?: SyncFileEntry
}

export interface CompareLibrarySyncParams extends BatchJobParams {
    leftRoot: string
    rightRoot: string
    pathFilterRules: PathFilterRule[]
}

export type LibrarySyncComparePhase = 'scanLeft' | 'scanRight' | 'compare'

export type LibrarySyncCompareProgress = (
    done: number,
    total: number,
    phase: LibrarySyncComparePhase
) => void

export interface CompareLibrarySyncResult {
    leftRoot: string
    rightRoot: string
    items: SyncDiffItem[]
    leftFileCount: number
    rightFileCount: number
    sameCount: number
    diffCount: number
}

export interface CopySyncFileParams {
    sourceRoot: string
    destRoot: string
    relativePath: string
}

export interface CopySyncFileResult {
    ok: boolean
    destPath: string
}

export interface MoveSyncFileParams {
    root: string
    fromRelativePath: string
    toRelativePath: string
}

export interface MoveSyncFileResult {
    ok: boolean
    destPath: string
}

export interface DeleteSyncFileEntry {
    leftRelativePath?: string
    rightRelativePath?: string
}

export interface DeleteSyncFilesParams extends BatchJobParams {
    leftRoot: string
    rightRoot: string
    entries: DeleteSyncFileEntry[]
}

export interface DeleteSyncFilesResult {
    deleted: number
    errors: Array<{ path: string; message: string }>
}

function resolveRoot(root: string): string {
    const check = checkSyncRoot(root)
    if (!check.ok) {
        throw new Error(check.error ?? '目录路径无效')
    }
    return check.path
}

export interface SyncRootCheck {
    path: string
    ok: boolean
    error?: string
}

export interface ValidateSyncRootsResult {
    left: SyncRootCheck
    right: SyncRootCheck
}

function checkSyncRoot(root: string | undefined | null): SyncRootCheck {
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

export function validateSyncRoots(
    leftRoot: string,
    rightRoot: string
): ValidateSyncRootsResult {
    return {
        left: checkSyncRoot(leftRoot),
        right: checkSyncRoot(rightRoot)
    }
}

function toRelativeKey(root: string, fullPath: string): string {
    return path.relative(root, fullPath).split(path.sep).join('/')
}

/** 递归扫描乐库根目录下的明文音频文件 */
export function walkLibraryAudioFiles(
    root: string,
    pathFilterRules: PathFilterRule[],
    onFileFound?: (fileCount: number) => void
): Map<string, SyncFileEntry> {
    const map = new Map<string, SyncFileEntry>()

    function walk(dir: string): void {
        checkBatchCancelled()
        let entries: fs.Dirent[]
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true })
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            console.error(`Warning: cannot read ${dir}: ${msg}`)
            return
        }

        for (const ent of entries) {
            checkBatchCancelled()
            if (shouldFilterEntry(ent.name, ent.isDirectory(), pathFilterRules)) {
                continue
            }
            const full = path.join(dir, ent.name)
            if (ent.isDirectory()) {
                walk(full)
                continue
            }
            if (!ent.isFile()) continue
            if (!isPlainAudioFilePath(full)) continue

            let stat: fs.Stats
            try {
                stat = fs.statSync(full)
            } catch {
                continue
            }

            const relativePath = toRelativeKey(root, full)
            map.set(relativePath, {
                relativePath,
                fileName: ent.name,
                size: stat.size
            })
            onFileFound?.(map.size)
        }
    }

    walk(root)
    return map
}

/** 相同相对路径下，仅比较文件名与文件大小（不含修改时间） */
function entriesEqual(a: SyncFileEntry, b: SyncFileEntry): boolean {
    return a.fileName === b.fileName && a.size === b.size
}

function fileSignature(entry: SyncFileEntry): string {
    return `${entry.fileName}\0${entry.size}`
}

/**
 * 将一侧缺失、另一侧在另一相对路径下找到同名同大小文件的条目合并为 moved。
 */
function pairMovedItems(items: SyncDiffItem[]): SyncDiffItem[] {
    const leftOnly: SyncDiffItem[] = []
    const rightOnly: SyncDiffItem[] = []
    const rest: SyncDiffItem[] = []

    for (const item of items) {
        if (item.kind === 'left_only') leftOnly.push(item)
        else if (item.kind === 'right_only') rightOnly.push(item)
        else rest.push(item)
    }

    const rightBySig = new Map<string, SyncDiffItem[]>()
    for (const item of rightOnly) {
        if (!item.right) continue
        const sig = fileSignature(item.right)
        const list = rightBySig.get(sig) ?? []
        list.push(item)
        rightBySig.set(sig, list)
    }

    const usedRight = new Set<SyncDiffItem>()
    const moved: SyncDiffItem[] = []
    const remainingLeft: SyncDiffItem[] = []

    for (const leftItem of leftOnly) {
        if (!leftItem.left) continue
        const sig = fileSignature(leftItem.left)
        const candidates =
            rightBySig.get(sig)?.filter((r) => !usedRight.has(r)) ?? []
        const match = candidates[0]
        if (match?.right) {
            usedRight.add(match)
            moved.push({
                relativePath: leftItem.relativePath,
                kind: 'moved',
                left: leftItem.left,
                right: match.right
            })
        } else {
            remainingLeft.push(leftItem)
        }
    }

    const remainingRight = rightOnly.filter((r) => !usedRight.has(r))

    return [...rest, ...moved, ...remainingLeft, ...remainingRight]
}

/** 递归扫描两侧目录并返回仅包含差异的条目列表 */
export function compareLibrarySync(
    params: CompareLibrarySyncParams & {
        onProgress?: LibrarySyncCompareProgress
    }
): CompareLibrarySyncResult {
    const leftRoot = resolveRoot(params.leftRoot)
    const rightRoot = resolveRoot(params.rightRoot)
    const pathFilterRules = params.pathFilterRules ?? []

    params.onProgress?.(0, 0, 'scanLeft')
    const leftMap = walkLibraryAudioFiles(
        leftRoot,
        pathFilterRules,
        (count) => params.onProgress?.(count, 0, 'scanLeft')
    )

    params.onProgress?.(0, 0, 'scanRight')
    const rightMap = walkLibraryAudioFiles(
        rightRoot,
        pathFilterRules,
        (count) => params.onProgress?.(count, 0, 'scanRight')
    )

    const allPaths = new Set<string>([
        ...leftMap.keys(),
        ...rightMap.keys()
    ])
    const sortedPaths = [...allPaths].sort((a, b) => a.localeCompare(b))
    const total = sortedPaths.length
    params.onProgress?.(0, total, 'compare')

    const items: SyncDiffItem[] = []
    let sameCount = 0

    for (let i = 0; i < sortedPaths.length; i++) {
        checkBatchCancelled()
        const relativePath = sortedPaths[i]!
        const left = leftMap.get(relativePath)
        const right = rightMap.get(relativePath)

        if (left && right) {
            if (entriesEqual(left, right)) {
                sameCount += 1
            } else {
                items.push({ relativePath, kind: 'modified', left, right })
            }
        } else if (left) {
            items.push({ relativePath, kind: 'left_only', left })
        } else if (right) {
            items.push({ relativePath, kind: 'right_only', right })
        }

        params.onProgress?.(i + 1, total, 'compare')
    }

    const pairedItems = pairMovedItems(items).sort((a, b) =>
        a.relativePath.localeCompare(b.relativePath)
    )

    return {
        leftRoot,
        rightRoot,
        items: pairedItems,
        leftFileCount: leftMap.size,
        rightFileCount: rightMap.size,
        sameCount,
        diffCount: pairedItems.length
    }
}

function assertUnderRoot(root: string, targetPath: string): void {
    const resolvedRoot = path.resolve(root)
    const resolvedTarget = path.resolve(targetPath)
    const rel = path.relative(resolvedRoot, resolvedTarget)
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error('目标路径不在指定根目录下')
    }
}

function normalizeRelativePath(relativePath: string): string {
    const normalized = relativePath.trim().replace(/\\/g, '/')
    if (!normalized || normalized.includes('..')) {
        throw new Error('相对路径无效')
    }
    return normalized
}

function normBaseName(name: string): string {
    return name.trim().toLowerCase()
}

function findSiblingLrc(audioPath: string): string | null {
    const dir = path.dirname(audioPath)
    let entries: fs.Dirent[]
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
        return null
    }
    const baseKey = normBaseName(path.parse(audioPath).name)
    for (const ent of entries) {
        if (!ent.isFile()) continue
        const parsed = path.parse(ent.name)
        if (parsed.ext.slice(1).toLowerCase() !== 'lrc') continue
        if (normBaseName(parsed.name) === baseKey) {
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

/**
 * 在同一乐库根目录内移动文件（含同名歌词），用于「已移动」差异对齐路径。
 */
export function moveSyncFile(params: MoveSyncFileParams): MoveSyncFileResult {
    const root = resolveRoot(params.root)
    const fromRelativePath = normalizeRelativePath(params.fromRelativePath)
    const toRelativePath = normalizeRelativePath(params.toRelativePath)

    if (fromRelativePath === toRelativePath) {
        throw new Error('源路径与目标路径相同')
    }

    const fromPath = path.join(root, ...fromRelativePath.split('/'))
    const toPath = path.join(root, ...toRelativePath.split('/'))

    assertUnderRoot(root, fromPath)
    assertUnderRoot(root, toPath)

    if (!fs.existsSync(fromPath)) {
        throw new Error(`源文件不存在: ${fromPath}`)
    }
    const fromStat = fs.statSync(fromPath)
    if (!fromStat.isFile()) {
        throw new Error(`不是文件: ${fromPath}`)
    }
    if (fs.existsSync(toPath)) {
        throw new Error(`目标位置已有文件: ${toRelativePath}`)
    }

    const fromLrc = findSiblingLrc(fromPath)

    fs.mkdirSync(path.dirname(toPath), { recursive: true })
    safeRenameFile(fromPath, toPath)

    if (fromLrc) {
        const toLrc = path.join(
            path.dirname(toPath),
            path.basename(fromLrc)
        )
        if (fs.existsSync(toLrc)) {
            throw new Error(`目标位置已有歌词: ${path.basename(toLrc)}`)
        }
        safeRenameFile(fromLrc, toLrc)
    }

    return { ok: true, destPath: toPath }
}

/** 将源根目录下的相对路径文件复制到目标根目录的同名相对位置 */
export function copySyncFile(params: CopySyncFileParams): CopySyncFileResult {
    const sourceRoot = resolveRoot(params.sourceRoot)
    const destRoot = resolveRoot(params.destRoot)
    const relativePath = normalizeRelativePath(params.relativePath)

    const sourcePath = path.join(sourceRoot, ...relativePath.split('/'))
    const destPath = path.join(destRoot, ...relativePath.split('/'))

    assertUnderRoot(sourceRoot, sourcePath)
    assertUnderRoot(destRoot, destPath)

    if (!fs.existsSync(sourcePath)) {
        throw new Error(`源文件不存在: ${sourcePath}`)
    }
    const stat = fs.statSync(sourcePath)
    if (!stat.isFile()) {
        throw new Error(`不是文件: ${sourcePath}`)
    }

    fs.mkdirSync(path.dirname(destPath), { recursive: true })
    fs.copyFileSync(sourcePath, destPath)

    return { ok: true, destPath }
}

function tryDeleteAudioWithSiblingLrc(
    filePath: string,
    errors: DeleteSyncFilesResult['errors']
): boolean {
    if (!fs.existsSync(filePath)) return false
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) {
        errors.push({ path: filePath, message: '不是文件' })
        return false
    }

    const lrcPath = findSiblingLrc(filePath)
    fs.unlinkSync(filePath)
    if (lrcPath && fs.existsSync(lrcPath)) {
        try {
            fs.unlinkSync(lrcPath)
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            errors.push({ path: lrcPath, message: `歌词删除失败: ${msg}` })
        }
    }
    return true
}

/** 删除选中差异项在左右乐库中的音频（含同名歌词） */
export function deleteSyncFiles(params: DeleteSyncFilesParams): DeleteSyncFilesResult {
    const leftRoot = resolveRoot(params.leftRoot)
    const rightRoot = resolveRoot(params.rightRoot)
    const errors: DeleteSyncFilesResult['errors'] = []
    let deleted = 0
    const seen = new Set<string>()

    function deleteUnderRoot(root: string, relativePath: string | undefined): void {
        if (!relativePath?.trim()) return
        const normalized = normalizeRelativePath(relativePath)
        const fullPath = path.resolve(path.join(root, ...normalized.split('/')))
        if (seen.has(fullPath)) return
        seen.add(fullPath)
        assertUnderRoot(root, fullPath)
        try {
            if (tryDeleteAudioWithSiblingLrc(fullPath, errors)) {
                deleted += 1
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            errors.push({ path: fullPath, message: msg })
        }
    }

    for (const entry of params.entries) {
        checkBatchCancelled()
        deleteUnderRoot(leftRoot, entry.leftRelativePath)
        deleteUnderRoot(rightRoot, entry.rightRelativePath)
    }

    return { deleted, errors }
}
