import { unref } from 'vue'
import { toIpcPlain } from '@shared/serialize'
import type { PathFilterRule } from '@shared/pathFilters'
import type { FindAudioInSearchRootsParams } from '@shared/sourceDirBrowse'

/**
 * 转为可通过 contextBridge / IPC structured clone 的字符串数组。
 * 须在渲染进程调用 electronAPI 前使用（克隆发生在进入 preload 之前）。
 */
export function plainStringList(value: unknown): string[] {
  const list = unref(value as string[] | undefined)
  if (!Array.isArray(list)) return []
  return [...list].map(String)
}

/** 剥离 Vue Proxy，供 contextBridge 传参（克隆发生在进入 preload 之前） */
export function plainForIpc<T>(value: T): T {
  return toIpcPlain(value)
}

export function plainFindAudioInSearchRootsParams(
  params: FindAudioInSearchRootsParams
): FindAudioInSearchRootsParams {
  return {
    searchRoots: plainStringList(params.searchRoots),
    queryNames: plainStringList(params.queryNames),
    pathFilterRules: plainForIpc(params.pathFilterRules) as PathFilterRule[]
  }
}
