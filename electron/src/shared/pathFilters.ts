/**
 * 路径过滤规则：纯文本匹配（前缀 / 后缀 / 完全匹配 / 包含），扫描时跳过命中项。
 */

export type PathFilterTarget = 'file' | 'folder' | 'both'

export type PathFilterMatch = 'prefix' | 'suffix' | 'equals' | 'contains'

export interface PathFilterRule {
  id: string
  target: PathFilterTarget
  match: PathFilterMatch
  /** 纯文本，大小写不敏感（前缀/后缀/包含/相等） */
  pattern: string
}

export const PATH_FILTER_TARGET_LABELS: Record<PathFilterTarget, string> = {
  file: '文件',
  folder: '文件夹',
  both: '文件和文件夹'
}

export const PATH_FILTER_MATCH_LABELS: Record<PathFilterMatch, string> = {
  prefix: '名称前缀',
  suffix: '名称后缀',
  equals: '完全匹配',
  contains: '名称包含'
}

const TARGETS: readonly PathFilterTarget[] = ['file', 'folder', 'both']
const MATCHES: readonly PathFilterMatch[] = [
  'prefix',
  'suffix',
  'equals',
  'contains'
]

export function createDefaultPathFilterRules(): PathFilterRule[] {
  return [
    {
      id: 'default-prefix-dot-underscore',
      target: 'both',
      match: 'prefix',
      pattern: '._'
    },
    {
      id: 'default-prefix-dot-file',
      target: 'file',
      match: 'prefix',
      pattern: '.'
    }
  ]
}

function newRuleId(): string {
  return `rule_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function createEmptyPathFilterRule(): PathFilterRule {
  return {
    id: newRuleId(),
    target: 'both',
    match: 'prefix',
    pattern: ''
  }
}

function isPathFilterTarget(v: unknown): v is PathFilterTarget {
  return typeof v === 'string' && (TARGETS as readonly string[]).includes(v)
}

function isPathFilterMatch(v: unknown): v is PathFilterMatch {
  return typeof v === 'string' && (MATCHES as readonly string[]).includes(v)
}

/** 从配置 JSON 解析；字段缺失时使用默认规则集 */
export function normalizePathFilterRules(raw: unknown): PathFilterRule[] {
  if (raw === undefined || raw === null) {
    return createDefaultPathFilterRules()
  }
  if (!Array.isArray(raw)) {
    return createDefaultPathFilterRules()
  }

  const out: PathFilterRule[] = []
  const seenIds = new Set<string>()

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const obj = item as Record<string, unknown>
    const pattern = typeof obj.pattern === 'string' ? obj.pattern.trim() : ''
    if (!pattern) continue

    const target = isPathFilterTarget(obj.target) ? obj.target : 'both'
    const match = isPathFilterMatch(obj.match) ? obj.match : 'prefix'

    let id = typeof obj.id === 'string' ? obj.id.trim() : ''
    if (!id || seenIds.has(id)) id = newRuleId()
    seenIds.add(id)

    out.push({ id, target, match, pattern })
  }

  return out
}

function matchesRule(
  name: string,
  isDirectory: boolean,
  rule: PathFilterRule
): boolean {
  const pattern = rule.pattern.trim()
  if (!pattern) return false

  if (rule.target === 'file' && isDirectory) return false
  if (rule.target === 'folder' && !isDirectory) return false

  const n = name
  const p = pattern
  const nl = n.toLowerCase()
  const pl = p.toLowerCase()

  switch (rule.match) {
    case 'prefix':
      return nl.startsWith(pl)
    case 'suffix':
      return nl.endsWith(pl)
    case 'equals':
      return nl === pl
    case 'contains':
      return nl.includes(pl)
    default:
      return false
  }
}

/** 是否应跳过该目录项（不进入、不收集） */
export function shouldFilterEntry(
  name: string,
  isDirectory: boolean,
  rules: PathFilterRule[]
): boolean {
  if (!rules.length) return false
  return rules.some((r) => matchesRule(name, isDirectory, r))
}

/** 保存配置前去掉空 pattern，并转为可序列化的普通对象 */
export function pathFilterRulesForSave(rules: PathFilterRule[]): PathFilterRule[] {
  return rules
    .filter((r) => r.pattern.trim().length > 0)
    .map((r) => ({
      id: String(r.id),
      target: r.target,
      match: r.match,
      pattern: r.pattern.trim()
    }))
}
