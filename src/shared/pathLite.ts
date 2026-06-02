/** 主进程与渲染进程通用的轻量路径工具（不依赖 node:path） */

/** 不含点的扩展名（小写），无扩展名时返回空字符串 */
export function fileExtensionLower(filePath: string): string {
  const base = filePath.replace(/[/\\]+$/, '')
  const i = base.lastIndexOf('.')
  if (i <= 0 || i === base.length - 1) return ''
  return base.slice(i + 1).toLowerCase()
}

export function dirnameOf(filePath: string): string {
  const m = filePath.match(/^(.*)[/\\][^/\\]+$/)
  return m ? m[1] : filePath
}

export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

export function samePath(a: string, b: string): boolean {
  return normalizePath(a) === normalizePath(b)
}

export function sameDir(a: string, b: string): boolean {
  return samePath(dirnameOf(a), dirnameOf(b))
}

/** 将相对路径（正斜杠）拼到根目录下，返回适合本机 fs 的路径 */
export function joinUnderRoot(root: string, relativePath: string): string {
  const base = root.replace(/[/\\]+$/, '')
  const sep = base.includes('\\') ? '\\' : '/'
  const parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean)
  return [base, ...parts].join(sep)
}
