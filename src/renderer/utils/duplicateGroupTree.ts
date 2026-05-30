import type { DuplicateGroup } from '@shared/libraryDuplicateTypes'

export interface DuplicateGroupTreeRow {
    key: string
    name: string
    isFolder: boolean
    group?: DuplicateGroup
    children?: DuplicateGroupTreeRow[]
}

function sortTreeNodes(nodes: DuplicateGroupTreeRow[]): void {
    nodes.sort((a, b) => {
        if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
    for (const node of nodes) {
        if (node.children?.length) sortTreeNodes(node.children)
    }
}

/** 将重复组按保留项相对路径构建为目录树 */
export function buildDuplicateGroupTree(groups: DuplicateGroup[]): DuplicateGroupTreeRow[] {
    const roots: DuplicateGroupTreeRow[] = []

    for (const group of groups) {
        const keepMember =
            group.members.find(
                (member) => member.relativePath === group.suggestedKeepKey
            ) ?? group.members[0]
        const parts = keepMember.relativePath.split('/').filter(Boolean)
        if (parts.length === 0) continue

        let currentLevel = roots
        let pathPrefix = ''

        for (let i = 0; i < parts.length - 1; i++) {
            const segment = parts[i]
            pathPrefix = pathPrefix ? `${pathPrefix}/${segment}` : segment

            let folder = currentLevel.find(
                (node) => node.isFolder && node.name === segment
            )
            if (!folder) {
                folder = {
                    key: `dir:${pathPrefix}`,
                    name: segment,
                    isFolder: true,
                    children: []
                }
                currentLevel.push(folder)
            }

            currentLevel = folder.children!
        }

        const fileName = parts[parts.length - 1]
        currentLevel.push({
            key: `group:${group.id}`,
            name: fileName,
            isFolder: false,
            group
        })
    }

    sortTreeNodes(roots)
    return roots
}

export function collectDuplicateGroupFolderKeys(
    rows: DuplicateGroupTreeRow[]
): string[] {
    const keys: string[] = []
    function walk(nodes: DuplicateGroupTreeRow[]): void {
        for (const node of nodes) {
            if (node.isFolder) {
                keys.push(node.key)
                if (node.children?.length) walk(node.children)
            }
        }
    }
    walk(rows)
    return keys
}

export function collectDuplicateGroupKeysUnderFolder(
    row: DuplicateGroupTreeRow
): string[] {
    const keys: string[] = []
    if (!row.isFolder || !row.children?.length) return keys

    function walk(nodes: DuplicateGroupTreeRow[]): void {
        for (const node of nodes) {
            if (node.isFolder) {
                if (node.children?.length) walk(node.children)
            } else {
                keys.push(node.key)
            }
        }
    }

    walk(row.children)
    return keys
}

export function flattenDuplicateGroupKeys(rows: DuplicateGroupTreeRow[]): string[] {
    const keys: string[] = []
    function walk(nodes: DuplicateGroupTreeRow[]): void {
        for (const node of nodes) {
            if (node.isFolder) {
                if (node.children?.length) walk(node.children)
            } else {
                keys.push(node.key)
            }
        }
    }
    walk(rows)
    return keys
}

export function resolveDuplicateGroupsByKeys(
    groups: DuplicateGroup[],
    keys: string[]
): DuplicateGroup[] {
    const keySet = new Set(keys)
    return groups.filter((group) => keySet.has(`group:${group.id}`))
}
