import type { SyncDiffItem } from '@shared/librarySyncJob'

export interface SyncDiffTreeRow {
    key: string
    name: string
    isFolder: boolean
    diffItem?: SyncDiffItem
    children?: SyncDiffTreeRow[]
}

function sortTreeNodes(nodes: SyncDiffTreeRow[]): void {
    nodes.sort((a, b) => {
        if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
    for (const node of nodes) {
        if (node.children?.length) sortTreeNodes(node.children)
    }
}

/** 将扁平差异列表按相对路径构建为目录树 */
export function buildSyncDiffTree(items: SyncDiffItem[]): SyncDiffTreeRow[] {
    const roots: SyncDiffTreeRow[] = []

    for (const item of items) {
        const parts = item.relativePath.split('/').filter(Boolean)
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
            key: `file:${item.relativePath}`,
            name: fileName,
            isFolder: false,
            diffItem: item
        })
    }

    sortTreeNodes(roots)
    return roots
}

/** 收集所有文件夹节点 key，用于默认展开 */
export function collectSyncDiffFolderKeys(rows: SyncDiffTreeRow[]): string[] {
    const keys: string[] = []
    function walk(nodes: SyncDiffTreeRow[]): void {
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

/** 收集某文件夹节点下（含子文件夹）全部文件行 key */
export function collectSyncDiffFileKeysUnderFolder(row: SyncDiffTreeRow): string[] {
    const keys: string[] = []
    if (!row.isFolder || !row.children?.length) return keys

    function walk(nodes: SyncDiffTreeRow[]): void {
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

/** 按树的前序遍历收集文件行 key（用于 Shift 连选） */
export function flattenSyncDiffFileKeys(rows: SyncDiffTreeRow[]): string[] {
    const keys: string[] = []
    function walk(nodes: SyncDiffTreeRow[]): void {
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

/** 根据选中 key 解析为差异项 */
export function resolveSyncDiffItemsByKeys(
    items: SyncDiffItem[],
    keys: string[]
): SyncDiffItem[] {
    const keySet = new Set(keys)
    return items.filter((item) => keySet.has(`file:${item.relativePath}`))
}
