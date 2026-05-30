/**
 * 乐库内重复音频扫描与删除（同名同大小、不同相对路径）。
 */

import fs from 'fs'
import path from 'path'
import type { PathFilterRule } from './pathFilters'
import {
    type DeleteDuplicateFilesParams,
    type DeleteDuplicateFilesResult,
    type DuplicateGroup,
    type DuplicateMember,
    type DuplicateScanStats,
    type ScanLibraryDuplicatesParams,
    type ScanLibraryDuplicatesResult,
    duplicateMemberKey
} from './libraryDuplicateTypes'
import {
    validateSyncRoots,
    walkLibraryAudioFiles,
    type SyncFileEntry
} from './librarySyncJob'

export type {
    DeleteDuplicateFilesParams,
    DeleteDuplicateFilesResult,
    DuplicateGroup,
    DuplicateMember,
    DuplicateScanStats,
    ScanLibraryDuplicatesParams,
    ScanLibraryDuplicatesResult
} from './libraryDuplicateTypes'
export { duplicateMemberKey } from './libraryDuplicateTypes'

function resolveRoot(root: string): string {
    const check = validateSyncRoots(root, root).left
    if (!check.ok) {
        throw new Error(check.error ?? '目录路径无效')
    }
    return check.path
}

function fileSignature(entry: SyncFileEntry): string {
    return `${entry.fileName}\0${entry.size}`
}

function parseMacOsDuplicateBase(basename: string): string | null {
    const m = basename.match(/^(.+)\((\d+)\)$/i)
    if (!m) return null
    return m[1].toLowerCase()
}

function pickSuggestedKeep(members: DuplicateMember[]): DuplicateMember {
    const sorted = [...members].sort((a, b) => {
        const aDup = parseMacOsDuplicateBase(path.parse(a.fileName).name) ? 1 : 0
        const bDup = parseMacOsDuplicateBase(path.parse(b.fileName).name) ? 1 : 0
        if (aDup !== bDup) return aDup - bDup
        const lenDiff = a.relativePath.length - b.relativePath.length
        if (lenDiff !== 0) return lenDiff
        return a.relativePath.localeCompare(b.relativePath, undefined, {
            sensitivity: 'base'
        })
    })
    return sorted[0]
}

function findDuplicateGroups(fileMap: Map<string, SyncFileEntry>): DuplicateGroup[] {
    const bySignature = new Map<string, SyncFileEntry[]>()

    for (const entry of fileMap.values()) {
        const sig = fileSignature(entry)
        const list = bySignature.get(sig) ?? []
        list.push(entry)
        bySignature.set(sig, list)
    }

    const groups: DuplicateGroup[] = []

    for (const [sig, entries] of bySignature) {
        if (entries.length < 2) continue

        const members: DuplicateMember[] = entries.map((entry) => ({
            relativePath: entry.relativePath,
            fileName: entry.fileName,
            size: entry.size
        }))

        const suggested = pickSuggestedKeep(members)

        groups.push({
            id: sig,
            fileName: entries[0].fileName,
            size: entries[0].size,
            members,
            suggestedKeepKey: duplicateMemberKey(suggested.relativePath)
        })
    }

    return groups.sort((a, b) =>
        a.members[0].relativePath.localeCompare(b.members[0].relativePath, undefined, {
            sensitivity: 'base'
        })
    )
}

function buildStats(
    fileCount: number,
    groups: DuplicateGroup[]
): DuplicateScanStats {
    let extraCopyCount = 0
    for (const group of groups) {
        extraCopyCount += group.members.length - 1
    }
    return {
        fileCount,
        groupCount: groups.length,
        extraCopyCount
    }
}

/** 扫描乐库内的重复音频（同名同大小、相对路径不同） */
export function scanLibraryDuplicates(
    params: ScanLibraryDuplicatesParams
): ScanLibraryDuplicatesResult {
    const rootInput = (params?.root ?? '').trim()
    if (!rootInput) {
        throw new Error('未指定扫描目录')
    }

    const check = validateSyncRoots(rootInput, rootInput).left
    if (!check.ok) {
        throw new Error(check.error ?? '目录无效')
    }

    const root = check.path
    const pathFilterRules = params.pathFilterRules ?? []
    const fileMap = walkLibraryAudioFiles(root, pathFilterRules)
    const groups = findDuplicateGroups(fileMap)

    return {
        root,
        stats: buildStats(fileMap.size, groups),
        groups
    }
}

function normalizeRelativePath(relativePath: string): string {
    const normalized = relativePath.trim().replace(/\\/g, '/')
    if (!normalized || normalized.includes('..')) {
        throw new Error('相对路径无效')
    }
    return normalized
}

function assertUnderRoot(root: string, targetPath: string): void {
    const resolvedRoot = path.resolve(root)
    const resolvedTarget = path.resolve(targetPath)
    const rel = path.relative(resolvedRoot, resolvedTarget)
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error('目标路径不在指定根目录下')
    }
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

function tryDeleteAudioWithSiblingLrc(
    filePath: string,
    errors: DeleteDuplicateFilesResult['errors']
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

/** 删除指定的重复副本（含同级同名歌词） */
export function deleteDuplicateFiles(
    params: DeleteDuplicateFilesParams
): DeleteDuplicateFilesResult {
    const rootInput = (params?.root ?? '').trim()
    if (!rootInput) {
        throw new Error('未指定扫描目录')
    }

    const root = resolveRoot(rootInput)
    const errors: DeleteDuplicateFilesResult['errors'] = []
    let deleted = 0
    const seen = new Set<string>()

    for (const relativePath of params.relativePaths) {
        const normalized = normalizeRelativePath(relativePath)
        const fullPath = path.resolve(path.join(root, ...normalized.split('/')))
        if (seen.has(fullPath)) continue
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

    return { deleted, errors }
}
