/** 将毫秒时间戳格式化为 zh-CN 本地日期时间字符串 */
export function formatFileTime(ms: unknown): string {
  const n =
    typeof ms === 'number' && Number.isFinite(ms)
      ? ms
      : typeof ms === 'bigint'
        ? Number(ms)
        : 0
  if (n <= 0) return '—'
  return new Date(n).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}
