import { unref } from 'vue'

/**
 * 转为可通过 contextBridge / IPC structured clone 的字符串数组。
 * 须在渲染进程调用 electronAPI 前使用（克隆发生在进入 preload 之前）。
 */
export function plainStringList(value: unknown): string[] {
  const list = unref(value as string[] | undefined)
  if (!Array.isArray(list)) return []
  return [...list].map(String)
}
