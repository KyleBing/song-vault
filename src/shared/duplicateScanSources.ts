export interface DuplicateScanSourceOption {
    label: string
    path: string
}

export interface DuplicateScanSourceGroup {
    key: string
    label: string
    options: DuplicateScanSourceOption[]
}

export interface DuplicateScanSourceInput {
    searchRoots: string[]
    syncLeftDir?: string
    syncLeftAlias?: string
    syncRightDir?: string
    syncRightAlias?: string
    /** 是否包含乐库同步目录，默认 true */
    includeSyncSources?: boolean
    /** 根目录分组标签，默认「乐库目录」 */
    libraryGroupLabel?: string
}

function normalizePath(value: string): string {
    return value.trim()
}

function pathBasename(dirPath: string): string {
    const parts = dirPath.replace(/\\/g, '/').split('/').filter(Boolean)
    return parts[parts.length - 1] ?? dirPath
}

function libraryOptionLabel(path: string, index: number, total: number): string {
    const name = pathBasename(path)
    if (total <= 1) return name
    return `${name}（${index + 1}/${total}）`
}

function syncOptionLabel(path: string, alias: string, sideLabel: string): string {
    const trimmedAlias = alias.trim()
    if (trimmedAlias) return trimmedAlias
    return `${sideLabel} · ${pathBasename(path)}`
}

/** 从设置中的乐库 / 同步目录构建分组选项（不含解码源等） */
export function buildDuplicateScanSourceGroups(
    input: DuplicateScanSourceInput
): DuplicateScanSourceGroup[] {
    const seen = new Set<string>()
    const groups: DuplicateScanSourceGroup[] = []
    const libraryGroupLabel = input.libraryGroupLabel?.trim() || '乐库目录'
    const includeSyncSources = input.includeSyncSources !== false

    const libraryRoots = input.searchRoots
        .map(normalizePath)
        .filter(Boolean)
    if (libraryRoots.length > 0) {
        const options: DuplicateScanSourceOption[] = []
        libraryRoots.forEach((path, index) => {
            if (seen.has(path)) return
            seen.add(path)
            options.push({
                label: libraryOptionLabel(path, index, libraryRoots.length),
                path
            })
        })
        if (options.length > 0) {
            groups.push({
                key: 'library',
                label: libraryGroupLabel,
                options
            })
        }
    }

    if (includeSyncSources) {
        const syncOptions: DuplicateScanSourceOption[] = []
        const left = normalizePath(input.syncLeftDir ?? '')
        const right = normalizePath(input.syncRightDir ?? '')

        if (left) {
            syncOptions.push({
                label: syncOptionLabel(left, input.syncLeftAlias ?? '', '同步左侧'),
                path: left
            })
            seen.add(left)
        }
        if (right && right !== left) {
            syncOptions.push({
                label: syncOptionLabel(
                    right,
                    input.syncRightAlias ?? '',
                    '同步右侧'
                ),
                path: right
            })
            seen.add(right)
        }

        if (syncOptions.length > 0) {
            groups.push({
                key: 'sync',
                label: '乐库同步',
                options: syncOptions
            })
        }
    }

    return groups
}

export function flattenDuplicateScanSourcePaths(
    groups: DuplicateScanSourceGroup[]
): string[] {
    const out: string[] = []
    const seen = new Set<string>()
    for (const group of groups) {
        for (const option of group.options) {
            if (seen.has(option.path)) continue
            seen.add(option.path)
            out.push(option.path)
        }
    }
    return out
}

export function hasDuplicateScanSourceOptions(
    groups: DuplicateScanSourceGroup[]
): boolean {
    return groups.some((group) => group.options.length > 0)
}
