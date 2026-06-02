import type { PathFilterRule } from './pathFilters'
import type { AudioFileMetrics } from './audioFileMetrics'

export interface DuplicateMember {
    relativePath: string
    fileName: string
    size: number
    audio?: AudioFileMetrics
}

export interface DuplicateGroup {
    id: string
    fileName: string
    size: number
    members: DuplicateMember[]
    suggestedKeepKey: string
}

export interface DuplicateScanStats {
    fileCount: number
    groupCount: number
    extraCopyCount: number
}

export interface ScanLibraryDuplicatesParams {
    root: string
    pathFilterRules: PathFilterRule[]
}

export interface ScanLibraryDuplicatesResult {
    root: string
    stats: DuplicateScanStats
    groups: DuplicateGroup[]
}

export interface DeleteDuplicateFilesParams {
    root: string
    relativePaths: string[]
}

export interface DeleteDuplicateFilesResult {
    deleted: number
    errors: Array<{ path: string; message: string }>
}

export function duplicateMemberKey(relativePath: string): string {
    return relativePath
}
