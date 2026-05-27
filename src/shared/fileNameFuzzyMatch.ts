/**
 * 客户端文件名模糊匹配：不访问磁盘，仅用于过滤已加载的列表。
 * 查询按空白分词；每个词须在文件名中按顺序出现（不区分大小写）。
 */

function fuzzySubsequenceMatch(haystack: string, needle: string): boolean {
  if (!needle) return true
  let i = 0
  for (const ch of haystack) {
    if (ch === needle[i]) i++
    if (i >= needle.length) return true
  }
  return false
}

/** 文件名是否匹配筛选查询；查询为空时恒为 true */
export function fileNameMatchesFuzzyQuery(
  fileName: string,
  query: string
): boolean {
  const trimmed = query.trim()
  if (!trimmed) return true
  const name = fileName.toLowerCase()
  const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean)
  return tokens.every((token) => fuzzySubsequenceMatch(name, token))
}
