import {
  createDefaultDataTableDisplay,
  normalizeDataTableDisplay,
  type DataTableDisplaySettings
} from './dataTableDisplay'
import {
  createDefaultFileListColumns,
  normalizeFileListColumns,
  type FileListColumnsSettings
} from './fileListColumns'
import {
  createDefaultPathFilterRules,
  normalizePathFilterRules,
  type PathFilterRule
} from './pathFilters'

export type { FileListColumnsSettings, FileListColumnId, FileListKind } from './fileListColumns'
export type { DataTableDisplaySettings } from './dataTableDisplay'

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
  /** 音乐解密输出目录 */
  decodeOutputDir: string
  /** 乐库同步：左侧目录（如本机乐库） */
  syncLeftDir: string
  /** 乐库同步：左侧目录别名 */
  syncLeftAlias: string
  /** 乐库同步：右侧目录（如存储卡乐库） */
  syncRightDir: string
  /** 乐库同步：右侧目录别名 */
  syncRightAlias: string
  /** 重复清理：扫描源目录 */
  duplicateScanDir: string
  /** 标签校准：扫描源目录 */
  metaMismatchScanDir: string
  /** 界面外观：深色 / 浅色 */
  appearance: AppAppearance
  /** 扫描与浏览时跳过的文件/文件夹名称规则 */
  pathFilterRules: PathFilterRule[]
  /** 各文件列表页表格可见列（顺序即展示顺序） */
  fileListColumns: FileListColumnsSettings
  /** 表格字号、行高等显示参数 */
  dataTableDisplay: DataTableDisplaySettings
  /** 已解锁高级功能（音乐解码等），持久保存 */
  advancedUnlocked: boolean
}

export function createDefaultAppConfig(): AppConfig {
  return {
    version: APP_CONFIG_VERSION,
    searchRoots: [],
    lrcDirs: [],
    decodeSourceDirs: [],
    decodeOutputDir: '',
    syncLeftDir: '',
    syncLeftAlias: '',
    syncRightDir: '',
    syncRightAlias: '',
    duplicateScanDir: '',
    metaMismatchScanDir: '',
    appearance: 'light',
    pathFilterRules: createDefaultPathFilterRules(),
    fileListColumns: createDefaultFileListColumns(),
    dataTableDisplay: createDefaultDataTableDisplay(),
    advancedUnlocked: false
  }
}

function optionalTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
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
    decodeOutputDir: optionalTrimmedString(obj.decodeOutputDir),
    syncLeftDir: optionalTrimmedString(obj.syncLeftDir),
    syncLeftAlias: optionalTrimmedString(obj.syncLeftAlias),
    syncRightDir: optionalTrimmedString(obj.syncRightDir),
    syncRightAlias: optionalTrimmedString(obj.syncRightAlias),
    duplicateScanDir: optionalTrimmedString(obj.duplicateScanDir),
    metaMismatchScanDir: optionalTrimmedString(obj.metaMismatchScanDir),
    appearance: isAppAppearance(obj.appearance)
      ? obj.appearance
      : createDefaultAppConfig().appearance,
    pathFilterRules: normalizePathFilterRules(obj.pathFilterRules),
    fileListColumns: normalizeFileListColumns(obj.fileListColumns),
    dataTableDisplay: normalizeDataTableDisplay(obj.dataTableDisplay),
    advancedUnlocked: obj.advancedUnlocked === true
  }
}
