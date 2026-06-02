/**
 * 乐库内重复音频扫描与删除（同名、不同相对路径；大小可相同或不同）。
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
import { readAudioFileMetricsBatch } from './readAudioFileMetrics'

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

function fileNameKey(entry: SyncFileEntry): string {
    return entry.fileName.toLowerCase()
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
    const byFileName = new Map<string, SyncFileEntry[]>()

    for (const entry of fileMap.values()) {
        const key = fileNameKey(entry)
        const list = byFileName.get(key) ?? []
        list.push(entry)
        byFileName.set(key, list)
    }

    const groups: DuplicateGroup[] = []

    for (const [key, entries] of byFileName) {
        if (entries.length < 2) continue

        const members: DuplicateMember[] = entries.map((entry) => ({
            relativePath: entry.relativePath,
            fileName: entry.fileName,
            size: entry.size
        }))

        const suggested = pickSuggestedKeep(members)

        groups.push({
            id: key,
            fileName: entries[0].fileName,
            size: suggested.size,
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

function memberFullPath(root: string, relativePath: string): string {
    return path.resolve(path.join(root, ...relativePath.split('/')))
}

async function enrichGroupsWithAudioMetrics(
    root: string,
    groups: DuplicateGroup[]
): Promise<DuplicateGroup[]> {
    if (groups.length === 0) return groups

    const fullPaths: string[] = []
    for (const group of groups) {
        for (const member of group.members) {
            fullPaths.push(memberFullPath(root, member.relativePath))
        }
    }

    const metricsByPath = await readAudioFileMetricsBatch(fullPaths)

    return groups.map((group) => ({
        ...group,
        members: group.members.map((member) => ({
            ...member,
            audio: metricsByPath[memberFullPath(root, member.relativePath)] ?? {}
        }))
    }))
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

/** 扫描乐库内的重复音频（同名、相对路径不同；大小可相同或不同） */
export async function scanLibraryDuplicates(
    params: ScanLibraryDuplicatesParams
): Promise<ScanLibraryDuplicatesResult> {
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
    const groups = await enrichGroupsWithAudioMetrics(
        root,
        findDuplicateGroups(fileMap)
    )

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
