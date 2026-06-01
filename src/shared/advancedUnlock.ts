/** 当前本地时间的 HHMM（24 小时制，用于高级功能会话解锁） */
export function formatTimeUnlockPin(date: Date = new Date()): string {
    const h = date.getHours()
    const m = date.getMinutes()
    return `${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}`
}

/** 校验 4 位解锁码是否与当前本地时分一致 */
export function verifyTimeUnlockPin(
    input: string,
    date: Date = new Date()
): boolean {
    const digits = input.replace(/\D/g, '')
    if (digits.length !== 4) return false
    return digits === formatTimeUnlockPin(date)
}
