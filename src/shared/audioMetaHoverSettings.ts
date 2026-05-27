export type AudioMetaHoverDisplayMode = 'minimal' | 'normal' | 'full'

export interface AudioMetaHoverSettings {
  /** 是否在音频文件上显示悬停标签信息 */
  enabled: boolean
  /** 鼠标悬停多少毫秒后弹出 */
  showDelayMs: number
  /** 极简 / 常规（中文标签）/ 完整 */
  displayMode: AudioMetaHoverDisplayMode
}

const DISPLAY_MODES: readonly AudioMetaHoverDisplayMode[] = [
  'minimal',
  'normal',
  'full'
]

const MIN_DELAY_MS = 0
const MAX_DELAY_MS = 3000
const DEFAULT_SHOW_DELAY_MS = 280

export function createDefaultAudioMetaHoverSettings(): AudioMetaHoverSettings {
  return {
    enabled: true,
    showDelayMs: DEFAULT_SHOW_DELAY_MS,
    displayMode: 'normal'
  }
}

function clampDelayMs(value: unknown): number {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : DEFAULT_SHOW_DELAY_MS
  if (!Number.isFinite(n)) return DEFAULT_SHOW_DELAY_MS
  return Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, Math.round(n)))
}

export function isAudioMetaHoverDisplayMode(
  value: unknown
): value is AudioMetaHoverDisplayMode {
  return (
    typeof value === 'string' &&
    (DISPLAY_MODES as readonly string[]).includes(value)
  )
}

export function normalizeAudioMetaHoverSettings(
  raw: unknown
): AudioMetaHoverSettings {
  const defaults = createDefaultAudioMetaHoverSettings()
  if (!raw || typeof raw !== 'object') return defaults
  const obj = raw as Record<string, unknown>
  return {
    enabled: typeof obj.enabled === 'boolean' ? obj.enabled : defaults.enabled,
    showDelayMs: clampDelayMs(obj.showDelayMs),
    displayMode: isAudioMetaHoverDisplayMode(obj.displayMode)
      ? obj.displayMode
      : defaults.displayMode
  }
}
