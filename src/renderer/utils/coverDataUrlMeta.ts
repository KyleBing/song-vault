import { formatFileSize } from '@shared/formatAudioDisplay'

export function dataUrlByteSize(dataUrl: string): number | undefined {
    const base64Match = /^data:[^;,]+(?:;[^;,]+)*;base64,(.*)$/i.exec(dataUrl)
    if (base64Match) {
        const b64 = base64Match[1]
        const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
        return Math.floor((b64.length * 3) / 4) - padding
    }
    const comma = dataUrl.indexOf(',')
    if (comma < 0) return undefined
    try {
        return new TextEncoder().encode(
            decodeURIComponent(dataUrl.slice(comma + 1))
        ).length
    } catch {
        return undefined
    }
}

export function formatCoverDataUrlMeta(
    dataUrl: string | undefined,
    pixelSize?: { width: number; height: number } | null
): string {
    const parts: string[] = []
    if (pixelSize && pixelSize.width > 0 && pixelSize.height > 0) {
        parts.push(`${pixelSize.width} × ${pixelSize.height}`)
    }
    if (dataUrl) {
        const bytes = dataUrlByteSize(dataUrl)
        if (bytes !== undefined && bytes > 0) {
            parts.push(formatFileSize(bytes))
        }
    }
    return parts.length ? parts.join(' · ') : '—'
}
