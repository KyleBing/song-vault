/** 主进程与渲染进程通用的轻量路径工具（不依赖 node:path） */

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
