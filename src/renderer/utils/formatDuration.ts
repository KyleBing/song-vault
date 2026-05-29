/** 将毫秒格式化为 mm:ss，超过 1 小时为 h:mm:ss */
export function formatElapsedMs(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) return '—'
    const totalSec = Math.max(0, Math.round(ms / 1000))
    const sec = totalSec % 60
    const totalMin = Math.floor(totalSec / 60)
    const min = totalMin % 60
    const hour = Math.floor(totalMin / 60)
    const pad2 = (n: number) => String(n).padStart(2, '0')
    if (hour > 0) {
        return `${hour}:${pad2(min)}:${pad2(sec)}`
    }
    return `${pad2(totalMin)}:${pad2(sec)}`
}
