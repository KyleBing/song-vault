/** 统一为正斜杠并去掉末尾分隔符，便于根目录前缀比较 */
function normPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '')
}

/**
 * 去掉已选根目录前缀，列表中只显示相对路径（不重复展示根文件夹名）。
 * 悬停提示仍可使用完整路径。
 */
export function relativeToRoots(filePath: string, roots: string[]): string {
  const file = normPath(filePath)
  if (!roots.length) return file

  let bestRel = file
  let bestRootLen = -1

  for (const root of roots) {
    const r = normPath(root)
    if (!r) continue

    if (file.toLowerCase() === r.toLowerCase()) {
      const name = file.split('/').pop() ?? file
      if (r.length > bestRootLen) {
        bestRootLen = r.length
        bestRel = name
      }
      continue
    }

    const prefix = `${r}/`
    if (file.toLowerCase().startsWith(prefix.toLowerCase())) {
      const rel = file.slice(r.length + 1)
      if (r.length > bestRootLen) {
        bestRootLen = r.length
        bestRel = rel
      }
    }
  }

  return bestRel.replace(/\//g, '\\')
}

export { dirnameOf } from '@shared/pathLite'

/** 拼接目录与文件名 */
export function joinPath(dir: string, name: string): string {
  const sep = dir.includes('\\') ? '\\' : '/'
  return dir.replace(/[/\\]+$/, '') + sep + name
}
