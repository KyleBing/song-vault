import { ref, type ComputedRef, type Ref } from 'vue'
import type { TreeOption } from 'naive-ui'
import type { PathFilterRule } from '@shared/pathFilters'
import type { SourceDirChild } from '@shared/sourceDirBrowse'
import { dirIcon } from '@renderer/composables/dirFileTable'

/** 子文件夹数量低于此值时自动展开该节点 */
export const TREE_AUTO_EXPAND_CHILD_THRESHOLD = 10

function pathKey(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase()
}

function isUnderAnyRoot(target: string, roots: string[]): boolean {
  const t = pathKey(target)
  return roots.some((r) => {
    const root = pathKey(r)
    return t === root || t.startsWith(`${root}/`)
  })
}

/** 父目录路径（保留原始分隔符风格） */
export function parentDirPath(p: string): string | null {
  const trimmed = p.replace(/[/\\]+$/, '')
  const sep = trimmed.includes('\\') ? '\\' : '/'
  const parts = trimmed.split(/[/\\]/).filter(Boolean)
  if (parts.length <= 1) {
    if (/^[a-zA-Z]:$/i.test(parts[0] ?? '')) return parts[0]! + sep
    return null
  }
  parts.pop()
  if (/^[a-zA-Z]:$/i.test(parts[0] ?? '')) {
    return parts.length === 1 ? `${parts[0]}${sep}` : parts.join(sep)
  }
  return parts.join(sep) || null
}

function rootLabel(root: string): string {
  return root.replace(/[/\\]+$/, '').split(/[/\\]/).pop() ?? root
}

function mapChildren(children: SourceDirChild[]): TreeOption[] {
  return children.map((c) => ({
    key: c.path,
    label: c.name,
    isLeaf: !c.hasSubdirs,
    prefix: dirIcon
  }))
}

function findNode(nodes: TreeOption[], key: string): TreeOption | null {
  for (const n of nodes) {
    if (String(n.key) === key) return n
    if (n.children?.length) {
      const found = findNode(n.children, key)
      if (found) return found
    }
  }
  return null
}

function remapSubtree(node: TreeOption, oldPrefix: string, newPrefix: string): void {
  const key = String(node.key)
  if (key === oldPrefix || key.startsWith(`${oldPrefix}\\`) || key.startsWith(`${oldPrefix}/`)) {
    const suffix = key.slice(oldPrefix.length)
    node.key = newPrefix + suffix
  }
  if (node.children?.length) {
    for (const child of node.children) {
      remapSubtree(child, oldPrefix, newPrefix)
    }
  }
}

export function useLazyDirTree(options: {
  roots: Ref<string[]>
  browseRoots: ComputedRef<string[]>
  filtersForApi: ComputedRef<PathFilterRule[]>
}) {
  const treeData = ref<TreeOption[]>([])
  const expandedKeys = ref<string[]>([])

  function mergeExpanded(...keys: string[]): void {
    const set = new Set(expandedKeys.value)
    for (const k of keys) {
      if (k) set.add(k)
    }
    expandedKeys.value = [...set]
  }

  function onUpdateExpandedKeys(keys: string[]): void {
    expandedKeys.value = keys
  }

  function pruneExpandedKeys(): void {
    expandedKeys.value = expandedKeys.value.filter((k) =>
      isUnderAnyRoot(k, options.roots.value)
    )
  }

  function replaceExpandedKeyPrefix(oldKey: string, newKey: string): void {
    const o = pathKey(oldKey)
    const nLen = oldKey.length
    expandedKeys.value = expandedKeys.value.map((k) => {
      const kk = pathKey(k)
      if (kk === o) return newKey
      if (kk.startsWith(`${o}/`)) {
        return newKey + k.slice(nLen)
      }
      return k
    })
  }

  function removeExpandedUnder(target: string): void {
    const t = pathKey(target)
    expandedKeys.value = expandedKeys.value.filter((k) => {
      const kk = pathKey(k)
      return kk !== t && !kk.startsWith(`${t}/`)
    })
  }

  async function fetchChildren(dirPath: string): Promise<SourceDirChild[]> {
    return window.electronAPI.listSourceDirChildren({
      dirPath,
      browseRoots: options.browseRoots.value,
      pathFilterRules: options.filtersForApi.value
    })
  }

  function maybeAutoExpandParent(dirPath: string, childCount: number): void {
    if (childCount > 0 && childCount < TREE_AUTO_EXPAND_CHILD_THRESHOLD) {
      mergeExpanded(dirPath)
    }
  }

  async function loadChildrenIntoNode(node: TreeOption): Promise<void> {
    const dirPath = String(node.key)
    const children = await fetchChildren(dirPath)
    node.children = mapChildren(children)
    node.isLeaf = children.length === 0
    maybeAutoExpandParent(dirPath, children.length)
  }

  async function onLoadTreeNode(node: TreeOption): Promise<void> {
    await loadChildrenIntoNode(node)
  }

  function rebuildTreeRoots(): void {
    const roots = options.roots.value
    treeData.value = roots.map((root) => ({
      key: root,
      label: rootLabel(root),
      isLeaf: false,
      prefix: dirIcon
    }))
    pruneExpandedKeys()
    if (roots.length > 0 && roots.length < TREE_AUTO_EXPAND_CHILD_THRESHOLD) {
      mergeExpanded(...roots)
    }
  }

  async function refreshNode(dirPath: string): Promise<void> {
    const node = findNode(treeData.value, dirPath)
    if (node) {
      await loadChildrenIntoNode(node)
    }
  }

  function removeNodeFromTree(key: string): void {
    removeExpandedUnder(key)
    const parent = parentDirPath(key)
    if (!parent) return
    const parentNode = findNode(treeData.value, parent)
    if (!parentNode?.children) return
    parentNode.children = parentNode.children.filter(
      (c) => String(c.key) !== key
    )
    parentNode.isLeaf = parentNode.children.length === 0
  }

  function renameNodeInTree(
    oldKey: string,
    newKey: string,
    newLabel: string
  ): void {
    const node = findNode(treeData.value, oldKey)
    if (node) {
      if (node.children?.length) {
        remapSubtree(node, oldKey, newKey)
      }
      node.key = newKey
      node.label = newLabel
    }
    replaceExpandedKeyPrefix(oldKey, newKey)
  }

  function joinDir(parent: string, name: string): string {
    const sep = parent.includes('\\') ? '\\' : '/'
    return parent.replace(/[/\\]+$/, '') + sep + name
  }

  /** 从根沿路径懒加载并展开到目标目录 */
  async function ensurePathLoaded(targetPath: string): Promise<void> {
    const roots = options.roots.value
    const root = roots.find((r) => isUnderAnyRoot(targetPath, [r]))
    if (!root) return

    const tk = pathKey(targetPath)
    const rk = pathKey(root)
    mergeExpanded(root)

    let node = findNode(treeData.value, root)
    if (!node) return
    if (!node.children?.length && !node.isLeaf) {
      await loadChildrenIntoNode(node)
    }

    if (tk === rk) return

    const rel = targetPath
      .slice(root.length)
      .replace(/^[/\\]+/, '')
    const segments = rel.split(/[/\\]/).filter(Boolean)
    let current = root

    for (const seg of segments) {
      current = joinDir(current, seg)
      mergeExpanded(current)
      node = findNode(treeData.value, current)
      if (!node) break
      if (!node.isLeaf && !node.children?.length) {
        await loadChildrenIntoNode(node)
      }
    }
  }

  return {
    treeData,
    expandedKeys,
    rebuildTreeRoots,
    onLoadTreeNode,
    onUpdateExpandedKeys,
    refreshNode,
    removeNodeFromTree,
    renameNodeInTree,
    mergeExpanded,
    pruneExpandedKeys,
    ensurePathLoaded,
    parentDirPath
  }
}
