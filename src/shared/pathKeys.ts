/**
 * 路径键规范化与比较（仅字符串操作，可在渲染进程使用）。
 * 勿在此文件引入 Node `path` / `fs`。
 */

/** 规范化路径键：正斜杠、去尾部分隔符、小写 */
export function normalizePathKey(p: string): string {
  let s = p.trim().replace(/\\/g, '/')
  while (s.length > 1 && s.endsWith('/')) {
    s = s.slice(0, -1)
  }
  return s.toLowerCase()
}

/** 是否为浏览根目录（配置项顶层路径） */
export function isBrowseRoot(targetPath: string, roots: string[]): boolean {
  const key = normalizePathKey(targetPath)
  if (!key) return false
  for (const r of roots) {
    if (!r.trim()) continue
    if (normalizePathKey(r) === key) return true
  }
  return false
}
