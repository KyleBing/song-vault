import { dirnameOf, normalizePath, samePath } from './pathLite'

/** 用户为「源歌词重复」指定的选择 */
export interface SourceSelection {
  /** 歌名 -> 用户手动选定的 LRC 源文件路径 */
  sourceOverrides?: Record<string, string>
  /** 优先使用的源子文件夹（某条歌词的所在目录，应用到其它歌名的相同目录规则） */
  preferredSourceDir?: string
}

/**
 * 从多个同名 LRC 候选中确定使用哪一个。
 * 优先：该首歌的手动选择 > 已记住的源子文件夹 > 仍无法唯一确定则返回 null。
 */
export function pickSourceLrc(
  songKey: string,
  candidates: string[],
  selection?: SourceSelection
): string | null {
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]

  const override = selection?.sourceOverrides?.[songKey]
  if (override) {
    const hit = candidates.find((c) => samePath(c, override))
    if (hit) return hit
  }

  const pref = selection?.preferredSourceDir
  if (pref) {
    const prefNorm = normalizePath(pref)
    const inPref = candidates.filter(
      (c) => normalizePath(dirnameOf(c)) === prefNorm
    )
    if (inPref.length === 1) return inPref[0]
  }

  return null
}

/** 候选歌词是否全部位于同一文件夹（同一父目录） */
export function allSourcesInSameDir(candidates: string[]): boolean {
  if (candidates.length <= 1) return true
  const first = normalizePath(dirnameOf(candidates[0]))
  return candidates.every((c) => normalizePath(dirnameOf(c)) === first)
}

/** 统计可执行复制的音频数量（含已通过选择解决的「待选源」） */
export function countReadyToCopy(
  items: Array<{
    status: string
    songKey: string
    sourceLrcPaths?: string[]
    hasLocalLrc: boolean
  }>,
  selection?: SourceSelection
): number {
  return items.filter((item) => {
    if (item.hasLocalLrc || item.status === 'matched' || item.status === 'copied') {
      return false
    }
    if (item.status === 'can_copy') return true
    if (item.status === 'source_ambiguous' && item.sourceLrcPaths?.length) {
      return pickSourceLrc(item.songKey, item.sourceLrcPaths, selection) !== null
    }
    return false
  }).length
}

export function countPendingSourcePick(
  items: Array<{
    status: string
    songKey: string
    sourceLrcPaths?: string[]
  }>,
  selection?: SourceSelection
): number {
  return items.filter(
    (item) =>
      item.status === 'source_ambiguous' &&
      item.sourceLrcPaths &&
      item.sourceLrcPaths.length > 1 &&
      pickSourceLrc(item.songKey, item.sourceLrcPaths, selection) === null
  ).length
}
