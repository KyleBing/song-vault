import {
  createDefaultPathFilterRules,
  normalizePathFilterRules,
  type PathFilterRule
} from './pathFilters'

export type { PathFilterRule }

/** 持久化配置文件名（保存在用户主目录） */
export const APP_CONFIG_FILE_NAME = 'config_search_match_replace.json'

export const APP_CONFIG_VERSION = 1 as const

export type AppAppearance = 'dark' | 'light'

const APPEARANCE_VALUES: readonly AppAppearance[] = ['dark', 'light']

export function isAppAppearance(value: unknown): value is AppAppearance {
  return (
    typeof value === 'string' &&
    (APPEARANCE_VALUES as readonly string[]).includes(value)
  )
}

export interface AppConfig {
  version: typeof APP_CONFIG_VERSION
  /** 音频搜索目标目录 */
  searchRoots: string[]
  /** LRC 源目录 */
  lrcDirs: string[]
  /** 待解码加密音乐源目录 */
  decodeSourceDirs: string[]
  /** 界面外观：深色 / 浅色 */
  appearance: AppAppearance
  /** 扫描与浏览时跳过的文件/文件夹名称规则 */
  pathFilterRules: PathFilterRule[]
}

export function createDefaultAppConfig(): AppConfig {
  return {
    version: APP_CONFIG_VERSION,
    searchRoots: [],
    lrcDirs: [],
    decodeSourceDirs: [],
    appearance: 'light',
    pathFilterRules: createDefaultPathFilterRules()
  }
}

function uniqueStrings(items: unknown): string[] {
  if (!Array.isArray(items)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    if (typeof item !== 'string') continue
    const p = item.trim()
    if (!p || seen.has(p)) continue
    seen.add(p)
    out.push(p)
  }
  return out
}

/** 从磁盘 JSON 解析并规范化 */
export function normalizeAppConfig(raw: unknown): AppConfig {
  if (!raw || typeof raw !== 'object') {
    return createDefaultAppConfig()
  }
  const obj = raw as Record<string, unknown>
  return {
    version: APP_CONFIG_VERSION,
    searchRoots: uniqueStrings(obj.searchRoots),
    lrcDirs: uniqueStrings(obj.lrcDirs),
    decodeSourceDirs: uniqueStrings(obj.decodeSourceDirs),
    appearance: isAppAppearance(obj.appearance)
      ? obj.appearance
      : createDefaultAppConfig().appearance,
    pathFilterRules: normalizePathFilterRules(obj.pathFilterRules)
  }
}
